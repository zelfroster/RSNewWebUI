const m = require('mithril');
const rs = require('rswebui');
const Data = require('network/network_data');
const {
  State,
  startDirectChat,
  getOnlineSslId,
  sendDirectChatMessage,
  loadAllDirectChatHistory,
} = require('network/network_state');
const { renderChatMessage, autoResizeTextarea, openChatImageViewer } = require('chat/chat_state');
const chatEmoji = require('chat/chat_emoji');
const HistoryBrowserModal = require('people/people_history');

// Direct peer-to-peer chat images do NOT require 200KB compression limit
function formatDirectChatImage(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1920;
      const maxHeight = 1080;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        callback(`<img src="${dataUrl}" />`, dataUrl);
      } else {
        callback(`<img src="${evt.target.result}" />`, evt.target.result);
      }
    };
    img.onerror = () => {
      if (evt.target.result) {
        callback(`<img src="${evt.target.result}" />`, evt.target.result);
      } else {
        callback(null, null);
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

const HASH_TIMEOUT_MS = 5 * 60 * 1000;
let hashJob = null;

function cancelDirectChatHash(error = '') {
  if (hashJob) {
    clearTimeout(hashJob.pollTimer);
    clearTimeout(hashJob.deadlineTimer);
    hashJob = null;
  }
  State.isHashing = false;
  State.hashingError = error;
}

function isActiveHashJob(job) {
  if (hashJob !== job) return false;
  if (State.currentChatPeerId !== job.peerId || State.selectedFriendGpgId !== job.friendId) {
    cancelDirectChatHash();
    return false;
  }
  return true;
}

function pollHashStatusForDirectChat(localpath, job) {
  if (!isActiveHashJob(job)) return;
  rs.rsJsonApiRequest('/rsFiles/ExtraFileStatus', { localpath }, (data, success) => {
    if (!isActiveHashJob(job)) return;
    if (!success) {
      cancelDirectChatHash('Could not check file hashing. Please try again.');
      m.redraw();
      return;
    }
    if (data && data.retval && data.info && data.info.hash && data.info.hash !== '0000000000000000000000000000000000000000') {
      const info = data.info;
      const sizeNum = info.size.xint64 || parseInt(info.size.xstr64) || info.size;
      const fileLink = `<a href="retroshare://file?name=${encodeURIComponent(info.name)}&size=${sizeNum}&hash=${info.hash}">${info.name}</a> (${rs.formatBytes(sizeNum)})`;

      State.chatInputMsg = State.chatInputMsg ? State.chatInputMsg + '\n' + fileLink : fileLink;
      State.showAttachModal = false;
      cancelDirectChatHash();
      State.attachPath = '';
      m.redraw();
    } else {
      job.pollTimer = setTimeout(() => pollHashStatusForDirectChat(localpath, job), 1000);
    }
  });
}

const ChatTab = () => {
  let showAttachmentMenu = false;

  function onDocClick(e) {
    if (showAttachmentMenu && !e.target.closest('.mobile-chat-attachment')) {
      showAttachmentMenu = false;
      m.redraw();
    }
  }

  return {
    oncreate: () => document.addEventListener('click', onDocClick, true),
    onremove: () => {
      document.removeEventListener('click', onDocClick, true);
      cancelDirectChatHash();
    },
    view: () => {
      const gpgId = State.selectedFriendGpgId;
      const friend = Data.gpgDetails[gpgId];
      if (!friend) return null;

      const sslId = getOnlineSslId(gpgId);

      if (!sslId) {
        return m('.network-chat-view', [
          m('.chat-warning', [
            m('i.fas.fa-exclamation-triangle'),
            m('h4', 'No Location Found'),
            m('p', 'This friend has no known locations to start a direct chat with.'),
          ]),
        ]);
      }

      if (!State.currentChatPeerId) {
        return m('.network-chat-view', [
          m('.chat-warning', [
            m('i.fas.fa-comments'),
            m('h4', 'Direct Chat'),
            m('p', 'Click below to start a direct chat with ' + friend.name + '.'),
            m(
              'button',
              {
                onclick: () => startDirectChat(sslId),
              },
              'Start Chat'
            ),
          ]),
        ]);
      }

      return m('.network-chat-view', [
        (() => {
          const activeLoc = friend.locations.find((loc) => loc.id === State.currentChatPeerId);
          const locName = activeLoc ? activeLoc.name : 'Unknown Location';
          const locOnline = activeLoc ? activeLoc.isOnline : false;
          return m('.chat-header-bar', {
            style: {
              padding: '0.75rem 1rem',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }
          }, [
            m('.chat-header-info', [
              m('.chat-header-name', { style: { fontWeight: '700', color: '#1e293b' } }, friend.name),
              m('.chat-header-location', { style: { fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', marginTop: '0.25rem' } }, [
                m('span', 'Location: ' + locName),
                m('span.status-dot', {
                  style: {
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: locOnline ? '#10b981' : '#ef4444',
                    marginLeft: '6px',
                    marginRight: '4px'
                  }
                }),
                m('span', { style: { color: locOnline ? '#10b981' : '#ef4444', fontWeight: '500' } }, locOnline ? 'Online' : 'Offline')
              ])
            ]),
            m('button.blue.history-btn', {
              title: 'View all direct chat history with this friend',
              style: 'padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.35rem; border: none; cursor: pointer; background-color: #3b82f6; color: #ffffff; font-weight: 600;',
              onclick: () => {
                State.showHistoryModal = true;
                State.historySearchQuery = '';
                loadAllDirectChatHistory();
              },
            }, [m('i.fas.fa-history'), 'History'])
          ]);
        })(),
        m(
          '.chat-messages[id=chat-messages-container]',
          State.chatMessages.map((msg) => {
            const isOwn = msg.own === true || msg.incoming === false;
            const senderName = isOwn
              ? (State.ownProfile.name || 'Me')
              : friend.name;
            const time = new Date((msg.sendTime || msg.recvTime || 0) * 1000).toLocaleTimeString();
            const text = msg.msg || msg.message || '';

            return m(
              '.chat-bubble-container' + (isOwn ? '.outgoing' : '.incoming'),
              [
                !isOwn && m('.chat-sender', senderName),
                m('.chat-bubble', renderChatMessage(text)),
                m('.chat-time', time),
              ]
            );
          })
        ),
        m(HistoryBrowserModal, {
          state: State,
          name: friend.name,
          ownName: State.ownProfile.name || 'You',
        }),
        State.attachedImage && m('.chat-attachment-preview', [
          m('.chat-attachment-preview__item', [
            m('img.chat-attachment-preview__thumb', {
              src: State.attachedImage.dataUrl,
              alt: 'Preview',
              title: 'Click to view full image',
              onclick: () => openChatImageViewer(State.attachedImage.dataUrl),
            }),
            m('button.chat-attachment-preview__remove', {
              type: 'button',
              title: 'Remove image',
              onclick: () => {
                State.attachedImage = null;
              },
            }, m('i.fas.fa-times')),
          ]),
          m('.chat-attachment-preview__info', [
            m('span.chat-attachment-preview__name', State.attachedImage.name || 'Image attached'),
            m('span.chat-attachment-preview__hint', 'Will be sent with your message'),
          ]),
        ]),

        m('.chat-input-area', { style: 'display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem; background: #ffffff; border-top: 1px solid #cbd5e1;' }, [
          m('button.chat-hub-action-btn.desktop-chat-attachment', {
            title: 'Attach file link',
            onclick: () => {
              State.showAttachModal = true;
              State.attachPath = '';
              State.attachBrowseHint = false;
              State.hashingError = '';
              m.redraw();
            }
          }, m('i.fas.fa-paperclip')),

          m('.mobile-chat-attachment', [
            m('button.chat-hub-action-btn', {
              title: 'Add attachment',
              onclick: (e) => {
                e.stopPropagation();
                showAttachmentMenu = !showAttachmentMenu;
                State.showEmojiPicker = false;
              },
            }, m('i.fas.fa-paperclip')),
            showAttachmentMenu && m('.mobile-chat-attachment__menu', [
              m('button.mobile-chat-attachment__option', {
                type: 'button',
                onclick: () => {
                  showAttachmentMenu = false;
                  State.showAttachModal = true;
                  State.attachPath = '';
                  State.attachBrowseHint = false;
                  State.hashingError = '';
                },
              }, [m('i.fas.fa-file'), ' File']),
              m('label.mobile-chat-attachment__option', [
                m('i.fas.fa-image'),
                ' Picture',
                m('input[type=file][accept=image/*]', {
                  style: 'display: none;',
                  onchange: (e) => {
                    if (!e.target.files || !e.target.files[0]) return;
                    const file = e.target.files[0];
                    formatDirectChatImage(file, (imgTag, dataUrl) => {
                      if (imgTag && dataUrl) {
                        State.attachedImage = { imgTag, dataUrl, name: file.name || 'Image' };
                        m.redraw();
                      }
                    });
                    showAttachmentMenu = false;
                    e.target.value = '';
                  },
                }),
              ]),
            ]),
          ]),

          m('.emoji-picker-wrapper', { style: 'position: relative;' }, [
            m('button.chat-hub-action-btn', {
              title: 'Insert emoji',
              onclick: (e) => {
                e.stopPropagation();
                State.showEmojiPicker = !State.showEmojiPicker;
              }
            }, m('i.fas.fa-smile')),
            State.showEmojiPicker && m(chatEmoji.EmojiPicker, {
              onSelect: (emoji) => {
                State.chatInputMsg = (State.chatInputMsg || '') + emoji;
                State.showEmojiPicker = false;
                m.redraw();
              }
            }),
          ]),

          m('label.chat-hub-action-btn.desktop-chat-attachment', {
            title: 'Send image',
            style: 'cursor: pointer;',
          }, [
            m('i.fas.fa-image'),
            m('input[type=file][accept=image/*]', {
              style: 'display: none;',
              onchange: (e) => {
                if (!e.target.files || !e.target.files[0]) return;
                const file = e.target.files[0];
                formatDirectChatImage(file, (imgTag, dataUrl) => {
                  if (imgTag && dataUrl) {
                    State.attachedImage = { imgTag, dataUrl, name: file.name || 'Image' };
                    m.redraw();
                  }
                });
                e.target.value = '';
              }
            })
          ]),

          m('textarea.chat-textarea', {
            placeholder: State.attachedImage ? 'Add a caption... (optional)' : 'Type a message here...',
            value: State.chatInputMsg,
            rows: 1,
            style: 'flex: 1; resize: none; border: 1px solid #cbd5e1; border-radius: 0.625rem; padding: 0.55rem 0.75rem; font-family: inherit; font-size: 0.9rem; line-height: 1.45; outline: none; min-height: 40px; max-height: 160px; height: 40px; box-sizing: border-box; overflow-y: hidden;',
            oncreate: (vnode) => autoResizeTextarea(vnode.dom),
            onupdate: (vnode) => autoResizeTextarea(vnode.dom),
            oninput: (e) => {
              State.chatInputMsg = e.target.value;
              autoResizeTextarea(e.target);
            },
            onpaste: (e) => {
              const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
              if (!items) return;
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                  e.preventDefault();
                  const blob = items[i].getAsFile();
                  formatDirectChatImage(blob, (imgTag, dataUrl) => {
                    if (imgTag && dataUrl) {
                      State.attachedImage = { imgTag, dataUrl, name: 'Pasted image' };
                      m.redraw();
                    }
                  });
                  break;
                }
              }
            },
            onkeydown: (e) => {
              if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault();
                  sendDirectChatMessage();
                } else if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  if (!document.execCommand || !document.execCommand('insertText', false, '\n')) {
                    const start = e.target.selectionStart || 0;
                    const end = e.target.selectionEnd || 0;
                    const val = e.target.value;
                    const newVal = val.substring(0, start) + '\n' + val.substring(end);
                    State.chatInputMsg = newVal;
                    e.target.value = newVal;
                    e.target.selectionStart = e.target.selectionEnd = start + 1;
                  } else {
                    State.chatInputMsg = e.target.value;
                  }
                  autoResizeTextarea(e.target);
                }
              }
            },
          }),
          m(
            'button.send-btn.blue',
            {
              style: 'height: 38px;',
              onclick: () => sendDirectChatMessage(),
            },
            [m('i.fas.fa-paper-plane'), ' Send']
          ),
        ]),

        State.showAttachModal && m('.attach-modal-overlay', {
          onclick: (e) => {
            if (e.target === e.currentTarget && !State.isHashing) {
              State.showAttachModal = false;
              State.attachPath = '';
              State.attachBrowseHint = false;
              State.hashingError = '';
            }
          }
        }, [
          m('.attach-modal', [
            m('.attach-modal-header', [
              m('i.fas.fa-paperclip.attach-modal-icon'),
              m('h4', 'Attach File to Direct Chat'),
            ]),
            m('p', 'Browse for a file or type the absolute path on your local system:'),
            m('input#direct-attach-file-picker[type=file]', {
              style: 'display:none',
              onchange: (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                  const fullPath = file.path;
                  const hasFullPath = fullPath && (fullPath.includes('/') || fullPath.includes('\\')) && fullPath !== file.name;
                  if (hasFullPath) {
                    State.attachPath = fullPath;
                    State.attachBrowseHint = false;
                  } else {
                    State.attachPath = file.name;
                    State.attachBrowseHint = true;
                  }
                  e.target.value = '';
                  State.hashingError = '';
                  m.redraw();
                }
              },
            }),
            m('.attach-path-row', [
              m('input[type=text]', {
                placeholder: 'e.g. C:\\Downloads\\file.zip',
                value: State.attachPath,
                oninput: (e) => {
                  State.attachPath = e.target.value;
                  State.attachBrowseHint = false;
                },
                disabled: State.isHashing,
              }),
              m('button.attach-browse-btn', {
                type: 'button',
                disabled: State.isHashing,
                title: 'Browse for file',
                onclick: () => {
                  const picker = document.getElementById('direct-attach-file-picker');
                  if (picker) picker.click();
                },
              }, [m('i.fas.fa-folder-open'), m('span', ' Browse…')]),
            ]),
            State.attachBrowseHint && m('.attach-path-hint', [
              m('i.fas.fa-info-circle'),
              m('span', [
                ' Your browser cannot expose the full file path. ',
                m('strong', 'Edit the path above'),
                ' and add your folder prefix — e.g. change ',
                m('code', 'file.zip'),
                ' to ',
                m('code', 'C:\\Downloads\\file.zip'),
                ' — then click Attach.',
              ]),
            ]),
            State.isHashing && m('.hashing-spinner', [
              m('i.fas.fa-spinner.fa-spin'),
              m('span', ' Hashing file... Please wait.')
            ]),
            !State.attachBrowseHint && State.hashingError && m('p.error-text', State.hashingError),
            m('.modal-buttons', [
              m('button.btn.blue', {
                disabled: State.isHashing || !State.attachPath.trim() || State.attachBrowseHint,
                onclick: () => {
                  const path = State.attachPath.trim();
                  cancelDirectChatHash();
                  const job = {
                    peerId: State.currentChatPeerId,
                    friendId: State.selectedFriendGpgId,
                  };
                  hashJob = job;
                  job.deadlineTimer = setTimeout(() => {
                    if (hashJob !== job) return;
                    cancelDirectChatHash('File hashing timed out after 5 minutes. Please try again.');
                    m.redraw();
                  }, HASH_TIMEOUT_MS);
                  State.isHashing = true;
                  State.hashingError = '';
                  m.redraw();

                  rs.rsJsonApiRequest('/rsFiles/ExtraFileHash', {
                    localpath: path,
                    period: 86400 * 7,
                    flags: 0
                  }, (data, success) => {
                    if (!isActiveHashJob(job)) return;
                    if (success && data.retval) {
                      pollHashStatusForDirectChat(path, job);
                    } else {
                      cancelDirectChatHash('Failed to initiate file hashing. Check the path and try again.');
                      m.redraw();
                    }
                  });
                }
              }, [m('i.fas.fa-link'), m('span', ' Attach')]),
              m('button.btn.red', {
                onclick: () => {
                  cancelDirectChatHash();
                  State.showAttachModal = false;
                  State.attachPath = '';
                  State.attachBrowseHint = false;
                  State.hashingError = '';
                }
              }, 'Cancel')
            ])
          ])
        ]),
      ]);
    },
  };
};

module.exports = ChatTab;
