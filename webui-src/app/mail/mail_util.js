const m = require('mithril');
const rs = require('rswebui');
const util = require('files/files_util');
const widget = require('widgets');
const peopleUtil = require('people/people_util');
const compose = require('mail/mail_compose');
const renderIdentityTooltip = require('mail/mail_identity_tooltip');

// rsmail.h
const RS_MSG_BOXMASK = 0x000f;

const RS_MSG_INBOX = 0x00;
const RS_MSG_SENTBOX = 0x01;
const RS_MSG_OUTBOX = 0x03;
const RS_MSG_DRAFTBOX = 0x05;
const RS_MSG_TRASH = 0x000020;
const RS_MSG_NEW = 0x10;
const RS_MSG_UNREAD_BY_USER = 0x40;
const RS_MSG_STAR = 0x200;
const RS_MSG_SPAM = 0x040000;

const RS_MSGTAGTYPE_IMPORTANT = 1;
const RS_MSGTAGTYPE_WORK = 2;
const RS_MSGTAGTYPE_PERSONAL = 3;
const RS_MSGTAGTYPE_TODO = 4;
const RS_MSGTAGTYPE_LATER = 5;
const RS_MSG_USER_REQUEST = 0x000400;
const RS_MSG_FRIEND_RECOMMENDATION = 0x000800;
const RS_MSG_PUBLISH_KEY = 0x020000;
const RS_MSG_SYSTEM = RS_MSG_USER_REQUEST | RS_MSG_FRIEND_RECOMMENDATION | RS_MSG_PUBLISH_KEY;

const MSG_ADDRESS_MODE_TO = 0x01;
const MSG_ADDRESS_MODE_CC = 0x02;
const MSG_ADDRESS_MODE_BCC = 0x03;

const BOX_ALL = 0x06;

const MessageCache = {};
const UserNicknamesCache = {};
const MailGxsDetailsCache = {};
const MailHoverState = {
  hoveredUser: null,
};

const messageUpdateListeners = [];
function onMessageUpdated(callback) {
  if (typeof callback === 'function') messageUpdateListeners.push(callback);
}
function triggerMessageUpdated(msgId, flag, isSet) {
  messageUpdateListeners.forEach((cb) => {
    try {
      cb(msgId, flag, isSet);
    } catch (e) {
      /* ignore */
    }
  });
}

function markMessageRead(msgId, onDone) {
  if (!msgId) return;
  if (MessageCache[msgId] && MessageCache[msgId].msgflags !== undefined) {
    MessageCache[msgId].msgflags &= ~(RS_MSG_NEW | RS_MSG_UNREAD_BY_USER);
  }
  triggerMessageUpdated(msgId, RS_MSG_NEW, false);
  rs.rsJsonApiRequest(
    '/rsMail/MessageRead',
    { msgId, unreadByUser: false },
    (data, success) => {
      if (MessageCache[msgId] && MessageCache[msgId].msgflags !== undefined) {
        MessageCache[msgId].msgflags &= ~(RS_MSG_NEW | RS_MSG_UNREAD_BY_USER);
      }
      triggerMessageUpdated(msgId, RS_MSG_NEW, false);
      if (onDone) onDone(Boolean(success && (!data || data.retval !== false)));
    }
  );
}

function renderMailUserTooltip() {
  if (!MailHoverState.hoveredUser) return null;
  const hUser = MailHoverState.hoveredUser;
  const details = MailGxsDetailsCache[hUser.gxsId];
  if (!details) return null;

  return renderIdentityTooltip({
    details,
    gxsId: hUser.gxsId,
    name: hUser.name,
    rect: hUser.rect,
  });
}

const tagTypesCache = {};
const defaultTagTypes = {
  1: { name: 'Important', color: '#ef4444' },
  2: { name: 'Work', color: '#f97316' },
  3: { name: 'Personal', color: '#22c55e' },
  4: { name: 'Todo', color: '#3b82f6' },
  5: { name: 'Later', color: '#a855f7' },
};

function getTagDetails(tagId) {
  return tagTypesCache[tagId] || defaultTagTypes[tagId] || { name: `Tag ${tagId}`, color: '#cbd5e1' };
}

function loadTagTypes() {
  rs.rsJsonApiRequest('/rsMail/getMessageTagTypes', {}, (res) => {
    if (res && res.body && res.body.tags && res.body.tags.types) {
      res.body.tags.types.forEach((tag) => {
        tagTypesCache[tag.key] = {
          name: tag.value.first,
          color: `#${tag.value.second.toString(16).padStart(6, '0')}`,
        };
      });
    }
  });
}
loadTagTypes();

function formatMailDate(ts) {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const isThisYear = date.getFullYear() === now.getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (isThisYear) {
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
}

// Utility functions
const humanReadableSize = (fileSize) => {
  return fileSize / 1024 > 1024
    ? fileSize / 1024 / 1024 > 1024
      ? (fileSize / 1024 / 1024 / 1024).toFixed(2) + ' GB'
      : (fileSize / 1024 / 1024).toFixed(2) + ' MB'
    : (fileSize / 1024).toFixed(2) + ' KB';
};

const stripHtmlForSnippet = (html) => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\.[A-Za-z0-9_-]+\s*\{[^}]*\}/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Layouts
const MessageSummary = () => {
  let details = {};
  let files;
  let isStarred = false;
  let isSpam = false;
  let fromUserInfo;
  function starMessage(e) {
    isStarred = !isStarred;
    rs.rsJsonApiRequest('/rsMail/MessageStar', { msgId: details.msgId, mark: isStarred });
    triggerMessageUpdated(details.msgId, RS_MSG_STAR, isStarred);
    // Stop event bubbling, both functions for supporting IE & FF
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  return {
    oninit: (v) => {
      rs.rsJsonApiRequest('/rsMail/getMessage', {
        msgId: v.attrs.details.msgId,
      })
        .then((res) => {
          if (res.body.retval) {
            details = res.body.msg;
            details.msgtags = v.attrs.details.msgtags;
            files = details.files;
            isStarred = (details.msgflags & 0xf00) === RS_MSG_STAR;
            isSpam = Boolean(details.msgflags & RS_MSG_SPAM);
            if (v.attrs.details && v.attrs.details.msgflags !== undefined) {
              details.msgflags = v.attrs.details.msgflags;
              isStarred = (details.msgflags & 0xf00) === RS_MSG_STAR;
              isSpam = Boolean(details.msgflags & RS_MSG_SPAM);
            }
            MessageCache[v.attrs.details.msgId] = details;
          }
        })
        .then(() => {
          if (details?.from?._addr_string) {
            rs.rsJsonApiRequest(
              '/rsIdentity/getIdDetails',
              { id: details.from._addr_string },
              (data) => {
                fromUserInfo = data.details;
                if (fromUserInfo) {
                  UserNicknamesCache[details.from._addr_string] = fromUserInfo.mNickname || '';
                  MailGxsDetailsCache[details.from._addr_string] = fromUserInfo;
                }
              }
            );
          }
        });
    },
    //  The reading pane's star/spam toggles refresh the summaries; the row's
    //  closure flags must follow the refreshed attrs or the icon stays stale
    //  until a remount.
    onupdate: (v) => {
      if (v.attrs.details && v.attrs.details.msgflags !== undefined) {
        isStarred = (v.attrs.details.msgflags & 0xf00) === RS_MSG_STAR;
        isSpam = Boolean(v.attrs.details.msgflags & RS_MSG_SPAM);
      }
    },
    view: (v) => {
      const spamActive = isSpam || Boolean((details.msgflags || v.attrs.details.msgflags) & RS_MSG_SPAM);
      function spamMessage(e) {
        isSpam = !spamActive;
        const targetId = details.msgId || (v.attrs.details && v.attrs.details.msgId);
        if (details.msgflags !== undefined) {
          if (isSpam) details.msgflags |= RS_MSG_SPAM;
          else details.msgflags &= ~RS_MSG_SPAM;
        }
        if (v.attrs.details && v.attrs.details.msgflags !== undefined) {
          if (isSpam) v.attrs.details.msgflags |= RS_MSG_SPAM;
          else v.attrs.details.msgflags &= ~RS_MSG_SPAM;
        }
        if (MessageCache[targetId]) {
          if (isSpam) MessageCache[targetId].msgflags |= RS_MSG_SPAM;
          else MessageCache[targetId].msgflags &= ~RS_MSG_SPAM;
        }
        rs.rsJsonApiRequest('/rsMail/MessageJunk', { msgId: targetId, mark: isSpam });
        triggerMessageUpdated(targetId, RS_MSG_SPAM, isSpam);
        e.stopImmediatePropagation();
        e.preventDefault();
        m.redraw();
      }

      const summaryMsg = v.attrs.details;
      const currentDetails = MessageCache[summaryMsg.msgId] || details || summaryMsg;
      const currentFlags = summaryMsg.msgflags !== undefined ? summaryMsg.msgflags : (currentDetails.msgflags || 0);
      if (MessageCache[summaryMsg.msgId] && summaryMsg.msgflags !== undefined) {
        MessageCache[summaryMsg.msgId].msgflags = summaryMsg.msgflags;
      }
      const flag = currentFlags & 0xf0;
      const isUnread = (flag === RS_MSG_NEW || flag === RS_MSG_UNREAD_BY_USER)
        && !(currentFlags & RS_MSG_TRASH)
        && !(currentFlags & RS_MSG_SPAM);
      const currentStatus = isUnread ? 'unread' : 'read';

      return m(
        'tr.msgbody',
        {
          key: v.attrs.details.msgId,
          class: [
            currentStatus,
            v.attrs.isSelected ? 'selected' : '',
          ].filter(Boolean).join(' '),
          onclick: () => {
            if (v.attrs.onOpen) v.attrs.onOpen();
            if (v.attrs.onSelect) {
              v.attrs.onSelect(v.attrs.details.msgId);
            } else {
              m.route.set('/mail/:tab/:msgId', { tab: v.attrs.category, msgId: v.attrs.details.msgId });
            }
          },
        },
        [
          m(
            'td.cell-star',
            m(`input.star-check[type=checkbox][id=msg-${v.attrs.details.msgId}]`, { checked: isStarred }),
            // Use label with  [for] to manipulate hidden checkbox
            m(
              `label.star-check[for=msg-${v.attrs.details.msgId}]`,
              {
                onclick: starMessage,
                class: (details.msgflags & 0xf00) === RS_MSG_STAR ? 'starred' : 'unstarred',
              },
              m('i.fas.fa-star')
            )
          ),
          m('td.cell-attachment', files && files.length > 0 ? m('i.fas.fa-paperclip', { title: `${files.length} attachment(s)` }) : null),
          m('td.cell-subject', [
            m('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }
            }, [
              files && files.length > 0 && m('i.fas.fa-paperclip.mobile-subject-clip', { title: `${files.length} attachment(s)` }),
              m('span', details.title),
              details.msgtags && details.msgtags.length > 0 && m('.mail-tags-container', { style: 'display: inline-flex; gap: 0.25rem;' },
                details.msgtags.map((tagId) => {
                  const tag = getTagDetails(tagId);
                  return m('span.mail-tag-badge', {
                    title: tag.name,
                    style: `display: inline-block; width: 10px; height: 10px; border-radius: 2px; background-color: ${tag.color};`
                  });
                })
              )
            ])
          ]),
          m(
            'td.cell-from',
            m(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  justifyContent: 'start',
                  cursor: 'pointer',
                },
                onmouseenter: (e) => {
                  if (!details?.from?._addr_string) return;
                  const gxsId = details.from._addr_string;
                  const name = fromUserInfo && Number(fromUserInfo.mId) !== 0 ? fromUserInfo.mNickname : '[Unknown]';
                  const rect = e.currentTarget.getBoundingClientRect();
                  MailHoverState.hoveredUser = { gxsId, name, rect };
                  if (fromUserInfo) MailGxsDetailsCache[gxsId] = fromUserInfo;
                  if (!MailGxsDetailsCache[gxsId]) {
                    rs.rsJsonApiRequest('/rsIdentity/getIdDetails', { id: gxsId }, (d) => {
                      if (d && d.details) {
                        MailGxsDetailsCache[gxsId] = d.details;
                        m.redraw();
                      }
                    });
                  }
                  m.redraw();
                },
                onmouseleave: () => {
                  MailHoverState.hoveredUser = null;
                  m.redraw();
                }
              },
              [
                m(peopleUtil.UserAvatar, {
                  avatar: fromUserInfo?.mAvatar,
                  firstLetter: (fromUserInfo?.mNickname || '').slice(0, 1).toUpperCase(),
                  identityId: details.from?._addr_string,
                  size: 24,
                }),
                m('span', fromUserInfo && Number(fromUserInfo.mId) !== 0 ? fromUserInfo.mNickname : '[Unknown]'),
              ]
            )
          ),
          m(
            'td.cell-spam',
            m(
              'button.spam-btn[type=button]',
              {
                onclick: spamMessage,
                class: spamActive ? 'spammed' : '',
                title: spamActive ? 'Mark as not spam' : 'Mark as spam',
              },
              m('i.fas.fa-fire')
            )
          ),
          m('td.cell-date', { title: new Date(details.ts * 1000).toLocaleString() }, formatMailDate(details.ts)),
          m('td.cell-spacer'),
        ]
      );
    },
  };
};

//  Bodies already being fetched for a card: a remount during the round trip
//  (filter toggle, page change) must not fire the same getMessage again.
const CardFetchesInFlight = new Set();

const MessageCard = () => {
  return {
    oninit: (v) => {
      const msgId = v.attrs.msg.msgId;
      if (!MessageCache[msgId] && !CardFetchesInFlight.has(msgId)) {
        CardFetchesInFlight.add(msgId);
        rs.rsJsonApiRequest('/rsMail/getMessage', { msgId }).then((res) => {
          CardFetchesInFlight.delete(msgId);
          if (res && res.body && res.body.retval) {
            MessageCache[msgId] = res.body.msg;
            MessageCache[msgId].msgtags = v.attrs.msg.msgtags;
            if (v.attrs.msg && v.attrs.msg.msgflags !== undefined) {
              MessageCache[msgId].msgflags = v.attrs.msg.msgflags;
            }
            const senderAddr = res.body.msg.from?._addr_string;
            if (senderAddr && !MailGxsDetailsCache[senderAddr]) {
              rs.rsJsonApiRequest('/rsIdentity/getIdDetails', { id: senderAddr }, (d) => {
                if (d && d.details) {
                  MailGxsDetailsCache[senderAddr] = d.details;
                  UserNicknamesCache[senderAddr] = d.details.mNickname || '';
                  m.redraw();
                }
              });
            }
            m.redraw();
          }
        });
      } else {
        const senderAddr = MessageCache[msgId]?.from?._addr_string || v.attrs.msg.from?._addr_string;
        if (senderAddr && !MailGxsDetailsCache[senderAddr]) {
          rs.rsJsonApiRequest('/rsIdentity/getIdDetails', { id: senderAddr }, (d) => {
            if (d && d.details) {
              MailGxsDetailsCache[senderAddr] = d.details;
              UserNicknamesCache[senderAddr] = d.details.mNickname || '';
              m.redraw();
            }
          });
        }
      }
    },
    view: (v) => {
      const msg = v.attrs.msg;
      const details = MessageCache[msg.msgId] || msg;
      if (MessageCache[msg.msgId] && msg.msgflags !== undefined) {
        MessageCache[msg.msgId].msgflags = msg.msgflags;
      }
      const senderAddr = details.from?._addr_string || msg.from?._addr_string;
      const senderName = UserNicknamesCache[senderAddr] || rs.userList.username(senderAddr) || '[Unknown]';
      const senderInfo = MailGxsDetailsCache[senderAddr];
      const currentFlags = msg.msgflags !== undefined ? msg.msgflags : (details.msgflags || 0);
      const flag = currentFlags & 0xf0;
      const isUnread = (flag === RS_MSG_NEW || flag === RS_MSG_UNREAD_BY_USER)
        && !(currentFlags & RS_MSG_TRASH)
        && !(currentFlags & RS_MSG_SPAM);
      const isStarred = (currentFlags & 0xf00) === RS_MSG_STAR;
      const isSpam = Boolean(currentFlags & RS_MSG_SPAM);
      const filesCount = (details.files && details.files.length) || msg.count || 0;
      const tags = details.msgtags || msg.msgtags || [];
      const isSelected = Boolean(v.attrs.isSelected);

      const rawMsg = details.msg || '';
      const snippet = stripHtmlForSnippet(rawMsg).slice(0, 110);

      return m(
        '.mail-card-item',
        {
          key: msg.msgId,
          class: [
            isSelected ? 'selected' : '',
            isUnread ? 'unread' : 'read',
          ].filter(Boolean).join(' '),
          onclick: () => {
            if (v.attrs.onSelect) v.attrs.onSelect(msg.msgId);
          },
        },
        [
          isUnread && m('.mail-card-unread-dot'),
          m('.mail-card-avatar-col', [
            m(peopleUtil.UserAvatar, {
              avatar: senderInfo?.mAvatar,
              firstLetter: senderName.slice(0, 1).toUpperCase(),
              identityId: senderAddr,
              size: 38,
            }),
          ]),
          m('.mail-card-content-col', [
            m('.mail-card-row-top', [
              m(
                '.mail-card-sender',
                {
                  title: senderName,
                  onmouseenter: (e) => {
                    if (!senderAddr) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    MailHoverState.hoveredUser = { gxsId: senderAddr, name: senderName, rect };
                    m.redraw();
                  },
                  onmouseleave: () => {
                    MailHoverState.hoveredUser = null;
                    m.redraw();
                  },
                },
                senderName
              ),
              m('.mail-card-date', { title: new Date((msg.ts?.xint64 || msg.ts || details.ts) * 1000).toLocaleString() }, formatMailDate(msg.ts?.xint64 || msg.ts || details.ts)),
            ]),
            m('.mail-card-row-subject', [
              m('.mail-card-subject', { title: details.title || msg.title }, details.title || msg.title || '(No Subject)'),
              m('.mail-card-indicators', [
                filesCount > 0 && m('i.fas.fa-paperclip.mail-card-clip', { title: `${filesCount} attachment(s)` }),
                m(
                  'span.mail-card-spam-btn[role=button]',
                  {
                    class: isSpam ? 'spammed' : '',
                    title: isSpam ? 'Mark as not spam' : 'Mark as spam',
                    onclick: (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const next = !isSpam;
                      if (details.msgflags !== undefined) {
                        if (next) details.msgflags |= RS_MSG_SPAM;
                        else details.msgflags &= ~RS_MSG_SPAM;
                      }
                      if (msg.msgflags !== undefined) {
                        if (next) msg.msgflags |= RS_MSG_SPAM;
                        else msg.msgflags &= ~RS_MSG_SPAM;
                      }
                      if (MessageCache[msg.msgId]) {
                        if (next) MessageCache[msg.msgId].msgflags |= RS_MSG_SPAM;
                        else MessageCache[msg.msgId].msgflags &= ~RS_MSG_SPAM;
                      }
                      rs.rsJsonApiRequest('/rsMail/MessageJunk', { msgId: msg.msgId, mark: next });
                      triggerMessageUpdated(msg.msgId, RS_MSG_SPAM, next);
                      m.redraw();
                    },
                  },
                  m('i.fas.fa-fire')
                ),
                m(
                  'span.mail-card-star-btn[role=button]',
                  {
                    class: isStarred ? 'starred' : '',
                    title: isStarred ? 'Unstar' : 'Star',
                    onclick: (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const next = !isStarred;
                      rs.rsJsonApiRequest('/rsMail/MessageStar', { msgId: msg.msgId, mark: next });
                      if (details.msgflags !== undefined) {
                        if (next) details.msgflags |= RS_MSG_STAR;
                        else details.msgflags &= ~RS_MSG_STAR;
                      }
                      if (msg.msgflags !== undefined) {
                        if (next) msg.msgflags |= RS_MSG_STAR;
                        else msg.msgflags &= ~RS_MSG_STAR;
                      }
                      if (MessageCache[msg.msgId]) {
                        if (next) MessageCache[msg.msgId].msgflags |= RS_MSG_STAR;
                        else MessageCache[msg.msgId].msgflags &= ~RS_MSG_STAR;
                      }
                      triggerMessageUpdated(msg.msgId, RS_MSG_STAR, next);
                      m.redraw();
                    },
                  },
                  m('i.fas.fa-star')
                ),
              ]),
            ]),
            snippet && m('.mail-card-snippet', snippet),
            tags.length > 0 &&
              m(
                '.mail-card-tags',
                tags.map((tagId) => {
                  const tag = getTagDetails(tagId);
                  return m(
                    'span.mail-card-tag-badge',
                    {
                      title: tag.name,
                      style: `background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;`,
                    },
                    [m('span.mail-card-tag-dot', { style: `background-color: ${tag.color};` }), tag.name]
                  );
                })
              ),
          ]),
        ]
      );
    },
  };
};

const AttachmentSection = () => {
  function handleAttachmentDownload(item) {
    const { fname: fileName, hash, size } = item;
    const xstr64 = typeof size === 'object' ? size.xstr64 : String(size);
    const flags = util.RS_FILE_REQ_ANONYMOUS_ROUTING;
    rs.rsJsonApiRequest(
      '/rsFiles/FileRequest',
      { fileName, hash, flags, size: { xstr64 } },
      (status) =>
        widget.popupMessage([
          m('i.fas.fa-file-medical'),
          m('h3', `File is ${status.retval ? 'being' : 'already'} downloaded!`),
        ])
    ).catch((error) => { });
  }
  return {
    view: (v) =>
      m('.attachments-wrapper', [
        v.attrs.files.map((file) => {
          const fileSizeNum = file.size ? (typeof file.size === 'object' ? file.size.xint64 || parseInt(file.size.xstr64) || 0 : Number(file.size) || 0) : 0;
          return m('.attachment-card', [
            m('.attachment-icon', m('i.fas.fa-paperclip')),
            m('.attachment-info', [
              m('.attachment-name', file.fname),
              m('.attachment-size', humanReadableSize(fileSizeNum)),
            ]),
            m(
              'button.btn-attachment-download',
              { onclick: () => handleAttachmentDownload(file) },
              [m('i.fas.fa-download'), m('span.btn-text', ' Download')]
            ),
          ]);
        }),
      ]),
  };
};

const ReadingPanePlaceholder = {
  view: () =>
    m('.mail-reading-placeholder', [
      m('.mail-reading-placeholder__icon', m('i.fas.fa-envelope-open-text')),
      m('h3.mail-reading-placeholder__title', 'Select an email to read'),
      m('p.mail-reading-placeholder__subtitle', 'Choose a message from the list to display its full content here.'),
    ]),
};

const MessageView = () => {
  let showCompose = false;
  let composeType = 'reply';
  let isStarred = false;
  let isSpam = false;
  let currentMsgId = null;

  function setShowCompose(bool) {
    showCompose = bool;
  }

  const MailData = {
    msgId: '',
    message: '',
    subject: '',
    sender: {},
    avatar: null,
    recipients: [],
    toList: {},
    ccList: {},
    bccList: {},
    timeStamp: '',
    files: [],
    msgtags: [],
  };

  function loadMail(msgId) {
    if (!msgId) return;
    currentMsgId = msgId;
    MailData.msgId = msgId;
    MailData.files = [];
    MailData.toList = {};
    MailData.ccList = {};
    MailData.bccList = {};
    MailData.avatar = null;
    MailData.subject = '';
    MailData.message = '';
    MailData.sender = {};
    MailData.timeStamp = '';
    MailData.msgtags = [];

    markMessageRead(msgId);

    rs.rsJsonApiRequest('/rsMail/getMessage', { msgId }).then(async (res) => {
      if (res && res.body && res.body.retval) {
        const msgDetails = res.body.msg;
        msgDetails.msgflags &= ~(RS_MSG_NEW | RS_MSG_UNREAD_BY_USER);
        MessageCache[msgId] = msgDetails;
        MailData.msgId = msgDetails.msgId;
        MailData.sender = msgDetails.from;
        MailData.subject = msgDetails.title || '(No Subject)';
        MailData.timeStamp = msgDetails.ts;
        MailData.msgtags = msgDetails.msgtags || (MessageCache[msgId] && MessageCache[msgId].msgtags) || [];
        isStarred = (msgDetails.msgflags & 0xf00) === RS_MSG_STAR;
        isSpam = Boolean(msgDetails.msgflags & RS_MSG_SPAM);

        MailData.files = [];
        (msgDetails.files || []).forEach((element) =>
          MailData.files.push({ ...element, from: msgDetails.from, ts: msgDetails.ts })
        );

        MailData.message = /<\/*[a-z][^>]+?>/gi.test(msgDetails.msg)
          ? msgDetails.msg
          : `<p style="white-space: pre-wrap; word-break: break-word; font-family: inherit;">${msgDetails.msg}</p>`;

        MailData.recipients = msgDetails.destinations || [];
        MailData.recipients.forEach((destDetail) => {
          const { _addr_string: addrString, _mode: mode } = destDetail;
          if (mode === MSG_ADDRESS_MODE_TO && !MailData.toList[addrString]) {
            MailData.toList[addrString] = destDetail;
          } else if (mode === MSG_ADDRESS_MODE_CC && !MailData.ccList[addrString]) {
            MailData.ccList[addrString] = destDetail;
          } else if (mode === MSG_ADDRESS_MODE_BCC && !MailData.bccList[addrString]) {
            MailData.bccList[addrString] = destDetail;
          }
          if (addrString && !UserNicknamesCache[addrString]) {
            rs.rsJsonApiRequest('/rsIdentity/getIdDetails', { id: addrString }, (data) => {
              if (data?.details) {
                UserNicknamesCache[addrString] = data.details.mNickname || '';
                MailGxsDetailsCache[addrString] = data.details;
                m.redraw();
              }
            });
          }
        });

        if (MailData.sender?._addr_string) {
          const sAddr = MailData.sender._addr_string;
          rs.rsJsonApiRequest('/rsIdentity/getIdDetails', { id: sAddr }, (data) => {
            if (data?.details) {
              MailData.avatar = data.details.mAvatar;
              UserNicknamesCache[sAddr] = data.details.mNickname || '';
              MailGxsDetailsCache[sAddr] = data.details;
              m.redraw();
            }
          });
        }
        m.redraw();
      }
    });
  }

  function toggleStar() {
    isStarred = !isStarred;
    rs.rsJsonApiRequest('/rsMail/MessageStar', { msgId: MailData.msgId, mark: isStarred }, () => {
      if (MessageCache[MailData.msgId]) {
        if (isStarred) MessageCache[MailData.msgId].msgflags |= RS_MSG_STAR;
        else MessageCache[MailData.msgId].msgflags &= ~RS_MSG_STAR;
      }
      triggerMessageUpdated(MailData.msgId, RS_MSG_STAR, isStarred);
      m.redraw();
    });
  }

  function toggleSpam() {
    isSpam = !isSpam;
    rs.rsJsonApiRequest('/rsMail/MessageJunk', { msgId: MailData.msgId, mark: isSpam }, () => {
      if (MessageCache[MailData.msgId]) {
        if (isSpam) MessageCache[MailData.msgId].msgflags |= RS_MSG_SPAM;
        else MessageCache[MailData.msgId].msgflags &= ~RS_MSG_SPAM;
      }
      triggerMessageUpdated(MailData.msgId, RS_MSG_SPAM, isSpam);
      widget.popupMessage([
        m('i.fas.fa-fire'),
        m('h3', isSpam ? 'Marked as spam' : 'Removed from spam'),
      ]);
      m.redraw();
    });
  }

  function markUnread() {
    rs.rsJsonApiRequest('/rsMail/MessageRead', { msgId: MailData.msgId, unreadByUser: true }, () => {
      if (MessageCache[MailData.msgId]) {
        MessageCache[MailData.msgId].msgflags |= RS_MSG_UNREAD_BY_USER;
      }
      triggerMessageUpdated(MailData.msgId, RS_MSG_UNREAD_BY_USER, true);
      widget.popupMessage([
        m('i.fas.fa-envelope'),
        m('h3', 'Marked as unread'),
      ]);
      m.redraw();
    });
  }

  function deleteMail(vnode) {
    rs.rsJsonApiRequest('/rsMail/MessageToTrash', { msgId: MailData.msgId, bTrash: true });
    rs.rsJsonApiRequest('/rsMail/MessageDelete', { msgId: MailData.msgId }).then((res) => {
      widget.popupMessage(
        m('.widget', [
          m('.widget__heading', m('h3', res.body.retval ? 'Success' : 'Error')),
          m('.widget__body', m('p', res.body.retval ? 'Mail Deleted.' : 'Error in Deleting.')),
        ])
      );
      if (vnode.attrs.onDeleted) {
        vnode.attrs.onDeleted(MailData.msgId);
      } else {
        m.route.set('/mail/:tab', { tab: m.route.param().tab || 'inbox' });
      }
    });
  }

  function confirmMailDelete(vnode) {
    widget.popupMessage([
      m('p', 'Are you sure you want to delete this mail?'),
      m('button.red', { onclick: () => deleteMail(vnode) }, 'Delete'),
    ]);
  }

  return {
    oninit: (v) => {
      loadMail(v.attrs.msgId);
    },
    onupdate: (v) => {
      if (v.attrs.msgId && v.attrs.msgId !== currentMsgId) {
        loadMail(v.attrs.msgId);
      }
    },
    view: (v) => {
      const senderAddr = MailData.sender?._addr_string;
      const senderName = (senderAddr && UserNicknamesCache[senderAddr]) || (senderAddr && rs.userList.username(senderAddr)) || '[Unknown]';
      const toKeys = Object.keys(MailData.toList || {});
      const ccKeys = Object.keys(MailData.ccList || {});
      const bccKeys = Object.keys(MailData.bccList || {});

      return m(
        '.msg-view.mail-reading-card',
        [
          m('.msg-view-nav', [
            m(
              'button.mail-view-back-btn[type=button][title=Back][aria-label=Back]',
              {
                onclick: () => {
                  if (v.attrs.onBack) v.attrs.onBack();
                  else m.route.set('/mail/:tab', { tab: m.route.param().tab || 'inbox' });
                },
              },
              m('i.fas.fa-chevron-left')
            ),
            m('.msg-view-nav__action', [
              m('button.mail-action-btn', {
                title: 'Reply',
                onclick: () => { composeType = 'reply'; setShowCompose(true); },
              }, [m('i.fas.fa-reply'), m('span.btn-text', ' Reply')]),
              m('button.mail-action-btn', {
                title: 'Forward',
                onclick: () => { composeType = 'forward'; setShowCompose(true); },
              }, [m('i.fas.fa-forward'), m('span.btn-text', ' Forward')]),
              m('button.mail-action-btn', {
                title: 'Reply All',
                onclick: () => { composeType = 'replyAll'; setShowCompose(true); },
              }, [m('i.fas.fa-reply-all'), m('span.btn-text', ' Reply All')]),
              m('button.mail-action-btn', {
                title: isStarred ? 'Unstar' : 'Star',
                class: isStarred ? 'mail-action-btn--starred' : '',
                onclick: toggleStar,
              }, [m('i.fas.fa-star'), m('span.btn-text', isStarred ? ' Starred' : ' Star')]),
              m('button.mail-action-btn', {
                title: isSpam ? 'Remove from spam' : 'Mark as spam',
                class: isSpam ? 'mail-action-btn--spam' : '',
                onclick: toggleSpam,
              }, [m('i.fas.fa-fire'), m('span.btn-text', isSpam ? ' Spam' : ' Spam')]),
              m('button.mail-action-btn', {
                title: 'Mark as unread',
                onclick: markUnread,
              }, [m('i.fas.fa-envelope'), m('span.btn-text', ' Unread')]),
              m('button.mail-action-btn.mail-action-btn--delete', {
                title: 'Delete mail',
                onclick: () => confirmMailDelete(v),
              }, [m('i.fas.fa-trash-alt'), m('span.btn-text', ' Delete')]),
            ]),
          ]),
          m('.msg-view__header', [
            m('.mail-reading-title-row', [
              m('h2.msg-view__title', MailData.subject),
              MailData.msgtags && MailData.msgtags.length > 0 &&
                m('.mail-reading-tags', MailData.msgtags.map((tagId) => {
                  const tag = getTagDetails(tagId);
                  return m('span.mail-card-tag-badge', {
                    title: tag.name,
                    style: `background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;`,
                  }, [m('span.mail-card-tag-dot', { style: `background-color: ${tag.color};` }), tag.name]);
                })),
            ]),
            m('.msg-details', [
              MailData.sender &&
                m(peopleUtil.UserAvatar, {
                  avatar: MailData.avatar,
                  firstLetter: senderName.slice(0, 1).toUpperCase(),
                  identityId: senderAddr,
                  size: 46,
                }),
              m('.msg-details__info', [
                m('.msg-details__info-row', [
                  m(
                    '.msg-sender-name',
                    {
                      onmouseenter: (e) => {
                        if (!senderAddr) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        MailHoverState.hoveredUser = { gxsId: senderAddr, name: senderName, rect };
                        m.redraw();
                      },
                      onmouseleave: () => {
                        MailHoverState.hoveredUser = null;
                        m.redraw();
                      },
                    },
                    senderName
                  ),
                  MailData.timeStamp &&
                    m('.msg-timestamp', { title: new Date(MailData.timeStamp * 1000).toLocaleString() },
                      new Date(MailData.timeStamp * 1000).toLocaleString()
                    ),
                ]),
                toKeys.length > 0 &&
                  m('.msg-recipients-row', [
                    m('span.recipient-label', 'To:'),
                    toKeys.map((addr) => {
                      const name = UserNicknamesCache[addr] || rs.userList.username(addr) || addr.slice(0, 8);
                      return m('span.recipient-chip', { title: addr }, name);
                    }),
                  ]),
                ccKeys.length > 0 &&
                  m('.msg-recipients-row', [
                    m('span.recipient-label', 'Cc:'),
                    ccKeys.map((addr) => {
                      const name = UserNicknamesCache[addr] || rs.userList.username(addr) || addr.slice(0, 8);
                      return m('span.recipient-chip', { title: addr }, name);
                    }),
                  ]),
                //  Own sent mail carries its Bcc list; the old view showed it.
                bccKeys.length > 0 &&
                  m('.msg-recipients-row', [
                    m('span.recipient-label', 'Bcc:'),
                    bccKeys.map((addr) => {
                      const name = UserNicknamesCache[addr] || rs.userList.username(addr) || addr.slice(0, 8);
                      return m('span.recipient-chip', { title: addr }, name);
                    }),
                  ]),
              ]),
            ]),
          ]),
          MailData.files && MailData.files.length > 0 &&
            m('.msg-view__attachment', [
              m('h4.attachments-title', [
                m('i.fas.fa-paperclip'),
                m('span', `Attachments (${MailData.files.length})`),
              ]),
              m('.msg-view__attachment-items', m(AttachmentSection, { files: MailData.files })),
            ]),
          m('.msg-view__body', [
            m('.mail-body-container', m.trust(MailData.message || '<p style="color: #94a3b8; font-style: italic;">(No message content)</p>')),
          ]),
          showCompose &&
            m(
              '.composePopupOverlay#mailComposerPopup',
              m(
                '.composePopup',
                senderAddr
                  ? m(compose, {
                      msgType: composeType,
                      senderId: senderAddr,
                      recipientList: MailData.toList,
                      ccList: MailData.ccList,
                      //  The prefix depends on the ACTION, not on whatever
                      //  prefix the subject already has: forwarding "Re: X"
                      //  must send "Fwd: Re: X", not "Re: X".
                      subject: composeType === 'forward'
                        ? (MailData.subject.startsWith('Fwd:') ? MailData.subject : `Fwd: ${MailData.subject}`)
                        : (MailData.subject.startsWith('Re:') ? MailData.subject : `Re: ${MailData.subject}`),
                      replyMessage: MailData.message,
                      timeStamp: new Date(MailData.timeStamp * 1000),
                      setShowCompose,
                    })
                  : m('.widget', m('.widget__heading', m('h3', 'Sender is not known'))),
                m('button.red.close-btn', { onclick: () => setShowCompose(false) }, m('i.fas.fa-times'))
              )
            ),
          renderMailUserTooltip(),
        ]
      );
    },
  };
};

const SortState = {
  column: 'date',
  direction: 'desc',
};

function setSort(column) {
  if (SortState.column === column) {
    SortState.direction = SortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    SortState.column = column;
    SortState.direction = (column === 'date' || column === 'attachments' || column === 'starred' || column === 'spam') ? 'desc' : 'asc';
  }
}

function sortList(list) {
  if (!list) return [];
  return [...list].sort((msgA, msgB) => {
    let valA, valB;
    switch (SortState.column) {
      case 'starred': {
        const aStarred = (MessageCache[msgA.msgId]?.msgflags & 0xf00) === RS_MSG_STAR || (msgA.msgflags & 0xf00) === RS_MSG_STAR;
        const bStarred = (MessageCache[msgB.msgId]?.msgflags & 0xf00) === RS_MSG_STAR || (msgB.msgflags & 0xf00) === RS_MSG_STAR;
        valA = aStarred ? 1 : 0;
        valB = bStarred ? 1 : 0;
        break;
      }
      case 'spam': {
        const aSpam = Boolean((MessageCache[msgA.msgId]?.msgflags & RS_MSG_SPAM) || (msgA.msgflags & RS_MSG_SPAM));
        const bSpam = Boolean((MessageCache[msgB.msgId]?.msgflags & RS_MSG_SPAM) || (msgB.msgflags & RS_MSG_SPAM));
        valA = aSpam ? 1 : 0;
        valB = bSpam ? 1 : 0;
        break;
      }
      case 'attachments': {
        const aCount = MessageCache[msgA.msgId]?.files?.length || msgA.count || 0;
        const bCount = MessageCache[msgB.msgId]?.files?.length || msgB.count || 0;
        valA = Number(aCount);
        valB = Number(bCount);
        break;
      }
      case 'subject': {
        const aTitle = MessageCache[msgA.msgId]?.title || msgA.title || '';
        const bTitle = MessageCache[msgB.msgId]?.title || msgB.title || '';
        valA = aTitle.toLowerCase();
        valB = bTitle.toLowerCase();
        break;
      }
      case 'from': {
        const aSenderId = MessageCache[msgA.msgId]?.from?._addr_string || msgA.from?._addr_string;
        const bSenderId = MessageCache[msgB.msgId]?.from?._addr_string || msgB.from?._addr_string;
        const aName = aSenderId && rs.userList.userMap[aSenderId];
        const bName = bSenderId && rs.userList.userMap[bSenderId];
        const aFrom = (UserNicknamesCache[aSenderId] || (aName && aName.name) || aName || '') + '';
        const bFrom = (UserNicknamesCache[bSenderId] || (bName && bName.name) || bName || '') + '';
        valA = aFrom.toLowerCase();
        valB = bFrom.toLowerCase();
        break;
      }
      case 'date':
      default: {
        const aTs = MessageCache[msgA.msgId]?.ts || msgA.ts?.xint64 || msgA.ts || 0;
        const bTs = MessageCache[msgB.msgId]?.ts || msgB.ts?.xint64 || msgB.ts || 0;
        valA = Number(aTs);
        valB = Number(bTs);
        break;
      }
    }

    if (valA < valB) return SortState.direction === 'asc' ? -1 : 1;
    if (valA > valB) return SortState.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

const Table = () => {
  let currentPage = 0;
  const pageSize = 50;
  return {
    view: (v) => {
      const renderHeader = (colName, label, isIcon = false) => {
        const isActive = SortState.column === colName;
        const iconClass = isActive
          ? (SortState.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
          : 'fas fa-sort';
        return m(
          `th.sortable-th.col-${colName}`,
          {
            onclick: () => setSort(colName),
            style: { cursor: 'pointer', userSelect: 'none' },
          },
          [
            isIcon ? label : m('span', label),
            ' ',
            m(`i.${iconClass}`, {
              style: {
                marginLeft: '0.25rem',
                opacity: isActive ? 1 : 0.2,
                transition: 'opacity 0.2s',
              },
            }),
          ]
        );
      };

      let totalItems = 0;
      const tbody = v.children[0];
      if (tbody && tbody.children) {
        const flatChildren = Array.isArray(tbody.children) ? tbody.children.flat().filter(Boolean) : [tbody.children].filter(Boolean);
        totalItems = flatChildren.length;

        const start = currentPage * pageSize;
        const end = start + pageSize;
        tbody.children = flatChildren.slice(start, end);
      }

      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      if (currentPage >= totalPages) currentPage = totalPages - 1;
      if (currentPage < 0) currentPage = 0;

      const paginationUI = totalItems > pageSize && m('.pagination', {
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          borderTop: '1px solid #eee',
          fontSize: '1rem',
          color: '#555',
          userSelect: 'none'
        }
      }, [
        m('button', {
          disabled: currentPage === 0,
          onclick: () => currentPage--,
          style: {
            padding: '0.4rem 0.8rem',
            background: currentPage === 0 ? '#ccc' : '#019dff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
            boxShadow: 'none'
          }
        }, m('i.fas.fa-chevron-left')),
        m('span.bold', `${totalItems > 0 ? currentPage * pageSize + 1 : 0} - ${Math.min((currentPage + 1) * pageSize, totalItems)} of ${totalItems}`),
        m('button', {
          disabled: currentPage >= totalPages - 1,
          onclick: () => currentPage++,
          style: {
            padding: '0.4rem 0.8rem',
            background: currentPage >= totalPages - 1 ? '#ccc' : '#019dff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
            boxShadow: 'none'
          }
        }, m('i.fas.fa-chevron-right'))
      ]);

      return m('.table-pagination-container', [
        m('table.mails', [
          m('tr', [
            renderHeader('starred', m('i.fas.fa-star'), true),
            renderHeader('attachments', m('i.fas.fa-paperclip'), true),
            renderHeader('subject', 'Subject'),
            renderHeader('from', 'From'),
            renderHeader('spam', m('i.fas.fa-fire'), true),
            renderHeader('date', 'Date'),
            m('th.col-spacer'),
          ]),
          tbody,
        ]),
        paginationUI,
        renderMailUserTooltip(),
      ]);
    },
  };
};

const SearchBar = () => {
  let searchString = '';
  return {
    view: ({ attrs: { list } }) =>
      m('input[type=text][placeholder=Search Subject].searchbar', {
        value: searchString,
        oninput: (e) => {
          searchString = e.target.value.toLowerCase();
          for (const hash in list) {
            list[hash].isSearched = list[hash].fname.toLowerCase().indexOf(searchString) > -1;
          }
        },
      }),
  };
};

const activeSideLink = {
  sideactive: 0,
  quicksideactive: -1,
};

const sidebarIcons = {
  inbox: m('i.fas.fa-inbox', { style: 'color: #3b82f6; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  outbox: m('i.fas.fa-envelope-open-text', { style: 'color: #10b981; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  drafts: m('i.fas.fa-edit', { style: 'color: #6b7280; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  sent: m('i.fas.fa-envelope-open', { style: 'color: #f59e0b; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  trash: m('i.fas.fa-trash-alt', { style: 'color: #ef4444; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  starred: m('i.fas.fa-star', { style: 'color: #eab308; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  system: m('i.fas.fa-bell', { style: 'color: #3b82f6; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  spam: m('i.fas.fa-fire', { style: 'color: #f97316; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  attachment: m('i.fas.fa-paperclip', { style: 'color: #06b6d4; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  important: m('i.fas.fa-square', { style: 'color: #ef4444; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  work: m('i.fas.fa-square', { style: 'color: #f97316; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  personal: m('i.fas.fa-square', { style: 'color: #22c55e; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  todo: m('i.fas.fa-square', { style: 'color: #3b82f6; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
  later: m('i.fas.fa-square', { style: 'color: #a855f7; margin-right: 0.75rem; font-size: 24px; width: 24px; text-align: center;' }),
};

const Sidebar = () => {
  return {
    view: ({ attrs: { tabs, baseRoute, size, onNavigate } }) =>
      m(
        '.sidebar',
        tabs.map((panelName, index) => {
          const displayName = panelName.charAt(0).toUpperCase() + panelName.slice(1);
          return m(
            m.route.Link,
            {
              class: index === activeSideLink.sideactive ? 'selected-sidebar-link' : '',
              style: 'display: flex; align-items: center;',
              onclick: () => {
                activeSideLink.sideactive = index;
                activeSideLink.quicksideactive = -1;
                if (onNavigate) onNavigate();
              },
              href: baseRoute + panelName,
            },
            [
              sidebarIcons[panelName] || null,
              m('span.sidebar-link-text', displayName),
              size[panelName] > 0 && m('span.sidebar-badge', size[panelName]),
            ]
          );
        })
      ),
  };
};

const SidebarQuickView = () => {
  // for the Mail tab, to be moved later.
  return {
    view: ({ attrs: { tabs, baseRoute, size, onNavigate } }) =>
      m(
        '.sidebarquickview',
        m('h6.bold', 'Quick View'),
        tabs.map((panelName, index) => {
          const displayName = panelName.charAt(0).toUpperCase() + panelName.slice(1);
          return m(
            m.route.Link,
            {
              class:
                index === activeSideLink.quicksideactive ? 'selected-sidebarquickview-link' : '',
              style: 'display: flex; align-items: center;',
              onclick: () => {
                activeSideLink.quicksideactive = index;
                activeSideLink.sideactive = -1;
                if (onNavigate) onNavigate();
              },
              href: baseRoute + panelName,
            },
            [
              sidebarIcons[panelName] || null,
              m('span.sidebar-link-text', displayName),
              size[panelName] > 0 && m('span.sidebar-badge', size[panelName]),
            ]
          );
        })
      ),
  };
};

module.exports = {
  MessageSummary,
  MessageCard,
  MessageView,
  ReadingPanePlaceholder,
  AttachmentSection,
  Table,
  SearchBar,
  Sidebar,
  SidebarQuickView,
  SortState,
  setSort,
  sortList,
  RS_MSG_BOXMASK,
  RS_MSG_INBOX,
  RS_MSG_SENTBOX,
  RS_MSG_OUTBOX,
  RS_MSG_DRAFTBOX,
  RS_MSG_NEW,
  RS_MSG_UNREAD_BY_USER,
  RS_MSG_STAR,
  RS_MSG_TRASH,
  RS_MSG_SYSTEM,
  RS_MSG_SPAM,
  RS_MSGTAGTYPE_IMPORTANT,
  RS_MSGTAGTYPE_LATER,
  RS_MSGTAGTYPE_PERSONAL,
  RS_MSGTAGTYPE_TODO,
  RS_MSGTAGTYPE_WORK,
  BOX_ALL,
  markMessageRead,
  onMessageUpdated,
  triggerMessageUpdated,
  MessageCache,
};
