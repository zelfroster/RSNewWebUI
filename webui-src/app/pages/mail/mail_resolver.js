const m = require('mithril');
const rs = require('rswebui');
const util = require('pages/mail/mail_util');
const compose = require('pages/mail/mail_compose');

const Messages = {
  all: [],
  inbox: [],
  sent: [],
  outbox: [],
  drafts: [],
  trash: [],
  starred: [],
  system: [],
  spam: [],
  attachment: [],
  important: [],
  work: [],
  personal: [],
  todo: [],
  later: [],
  load() {
    rs.rsJsonApiRequest('/rsMsgs/getMessageSummaries', { box: util.BOX_ALL }, (data) => {
      Messages.all = data.msgList;
      Messages.inbox = Messages.all
        .filter((msg) => (msg.msgflags & util.RS_MSG_BOXMASK) === util.RS_MSG_INBOX)
        .reverse();
      Messages.sent = Messages.all
        .filter((msg) => (msg.msgflags & util.RS_MSG_BOXMASK) === util.RS_MSG_SENTBOX)
        .reverse();
      Messages.outbox = Messages.all
        .filter((msg) => (msg.msgflags & util.RS_MSG_BOXMASK) === util.RS_MSG_OUTBOX)
        .reverse();
      Messages.drafts = Messages.all
        .filter((msg) => (msg.msgflags & util.RS_MSG_BOXMASK) === util.RS_MSG_DRAFTBOX)
        .reverse();
      Messages.trash = Messages.all.filter((msg) => msg.msgflags & util.RS_MSG_TRASH).reverse();
      Messages.starred = Messages.all.filter((msg) => msg.msgflags & util.RS_MSG_STAR).reverse();
      Messages.system = Messages.all.filter((msg) => msg.msgflags & util.RS_MSG_SYSTEM).reverse();
      Messages.spam = Messages.all.filter((msg) => msg.msgflags & util.RS_MSG_SPAM).reverse();

      Messages.attachment = Messages.all.filter((msg) => msg.count).reverse();

      // Messages.important = Messages.all.filter(
      //   (msg) => msg.msgflags & util.RS_MSGTAGTYPE_IMPORTANT
      // );
      // Messages.work = Messages.all.filter((msg) => msg.msgflags & util.RS_MSGTAGTYPE_WORK);
      // Messages.personal = Messages.all.filter((msg) => msg.msgflags & util.RS_MSGTAGTYPE_PERSONAL);
      // Messages.todo = Messages.all.filter((msg) => msg.msgflags & util.RS_MSGTAGTYPE_TODO);
      // Messages.later = Messages.all.filter((msg) => msg.msgflags & util.RS_MSGTAGTYPE_LATER);
    });
  },
};

const sections = {
  inbox: require('pages/mail/mail_inbox'),
  outbox: require('pages/mail/mail_outbox'),
  drafts: require('pages/mail/mail_draftbox'),
  sent: require('pages/mail/mail_sentbox'),
  trash: require('pages/mail/mail_trashbox'),
};
const sectionsquickview = {
  starred: require('pages/mail/mail_starred'),
  system: require('pages/mail/mail_system'),
  spam: require('pages/mail/mail_spam'),
  attachment: require('pages/mail/mail_attachment'),
  important: require('pages/mail/mail_important'),
  work: require('pages/mail/mail_work'),
  todo: require('pages/mail/mail_todo'),
  later: require('pages/mail/mail_later'),
  personal: require('pages/mail/mail_personal'),
};
const tagselect = {
  showval: 'Tags',
  opts: ['Tags', 'Important', 'Work', 'Personal'],
};
const Layout = () => {
  let showCompose = false;
  // setFunction like react to show/hide popup
  function setShowCompose(bool) {
    showCompose = bool;
  }
  return {
    oninit: () => Messages.load(),
    view: (vnode) => {
      const sectionsSize = {
        inbox: Messages.inbox.length,
        outbox: Messages.outbox.length,
        drafts: Messages.drafts.length,
        sent: Messages.sent.length,
        trash: Messages.trash.length,
      };
      const sectionsQuickviewSize = {
        starred: Messages.starred.length,
        system: Messages.system.length,
        spam: Messages.spam.length,
        attachment: Messages.attachment.length,
        important: Messages.important.length,
        work: Messages.work.length,
        todo: Messages.todo.length,
        later: Messages.later.length,
        personal: Messages.personal.length,
      };

      return [
        m('.side-bar', [
          m('button.mail-compose-btn', { onclick: () => setShowCompose(true) }, 'Compose'),
          m(util.Sidebar, {
            tabs: Object.keys(sections),
            size: sectionsSize,
            baseRoute: '/mail/',
          }),
          m(util.SidebarQuickView, {
            tabs: Object.keys(sectionsquickview),
            size: sectionsQuickviewSize,
            baseRoute: '/mail/',
          }),
        ]),
        m(
          '.node-panel',
          m('.widget', [
            m.route.get().split('/').length < 4 &&
              m('.top-heading', [
                m(
                  'select.mail-tag',
                  {
                    value: tagselect.showval,
                    onchange: (e) => (tagselect.showval = tagselect.opts[e.target.selectedIndex]),
                  },
                  [tagselect.opts.map((opt) => m('option', { value: opt }, opt.toLocaleString()))]
                ),
                m(util.SearchBar, { list: {} }),
              ]),
            vnode.children,
          ])
        ),
        m(
          '.composePopupOverlay#mailComposerPopup',
          { style: { display: showCompose ? 'block' : 'none' } },
          m(
            '.composePopup',
            m(compose, { msgType: 'compose', setShowCompose }),
            m('button.red.close-btn', { onclick: () => setShowCompose(false) }, m('i.fas.fa-times'))
          )
        ),
      ];
    },
  };
};

module.exports = {
  view: ({ attrs, attrs: { tab, msgId } }) => {
    // TODO: utilize multiple routing params
    if (Object.prototype.hasOwnProperty.call(attrs, 'msgId')) {
      return m(Layout, m(util.MessageView, { msgId }));
    }
    return m(
      Layout,
      m(sections[tab] || sectionsquickview[tab], {
        list: Messages[tab].sort((msgA, msgB) => {
          const msgADate = new Date(msgA.ts.xint64 * 1000);
          const msgBDate = new Date(msgB.ts.xint64 * 1000);
          return msgADate < msgBDate;
        }),
      })
    );
  },
};
