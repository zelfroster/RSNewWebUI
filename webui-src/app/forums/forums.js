const m = require('mithril');
const widget = require('widgets');
const rs = require('rswebui');
const util = require('forums/forums_util');
const viewUtil = require('forums/forum_view');
const peopleUtil = require('people/people_util');
const icon = require('icon');

const getForums = {
  All: [],
  Popular: [],
  Subscribed: [],
  MyForums: [],
  async load() {
    const res = await rs.rsJsonApiRequest('/rsgxsforums/getForumsSummaries');
    if (res && res.body && res.body.forums) {
      getForums.All = res.body.forums;
      getForums.Popular = getForums.All;
      getForums.Subscribed = getForums.All.filter(
        (forum) =>
          forum.mSubscribeFlags === util.GROUP_SUBSCRIBE_SUBSCRIBED ||
          forum.mSubscribeFlags === util.GROUP_MY_FORUM
      );
      getForums.MyForums = getForums.All.filter(
        (forum) => forum.mSubscribeFlags === util.GROUP_MY_FORUM
      );
    }
  },
};
//  Group lists change on the scale of a conversation, not of a frame.
const FORUM_LIST_REFRESH_MS = 30000;

const sections = {
  MyForums: require('forums/my_forums'),
  Subscribed: require('forums/subscribed_forums'),
  Popular: require('forums/popular_forums'),
  Other: require('forums/other_forums'),
};

const navLabels = {
  MyForums: 'My Forums',
  Subscribed: 'Subscribed',
  Popular: 'Popular',
  Other: 'All Forums',
};

//  The page title, which can say more than the rail label beside it.
const pageTitles = {
  MyForums: 'My Forums',
  Subscribed: 'Subscribed Forums',
  Popular: 'Popular Forums',
  Other: 'All Forums',
};

const navIcons = {
  MyForums: 'comments',
  Subscribed: 'bookmark',
  Popular: 'fire',
  Other: 'globe',
};

const Layout = () => {
  let ownId;
  const createForum = () =>
    ownId &&
    util.popupmessage(
      m(viewUtil.createforum, {
        authorId: ownId,
        onCreated: getForums.load,
      }),
      'create-forum-modal',
      {
        title: 'Create Forum',
        lead: 'Set up the forum and choose its publishing permissions.',
      }
    );

  return {
    oninit: () => {
      //  Was every 5 s. getForumsSummaries returns the whole list every time,
      //  and on a phone each poll is a fresh TCP handshake on a server that
      //  answers one request at a time; the boards list already settled on 30 s.
      rs.setBackgroundTask(getForums.load, FORUM_LIST_REFRESH_MS, () => {
        return m.route.get().includes('/forums');
      });
      peopleUtil.ownIds((data) => {
        ownId = data;
        for (let i = 0; i < ownId.length; i++) {
          if (Number(ownId[i]) === 0) {
            ownId.splice(i, 1);
          }
        }
        ownId.unshift(0);
      });
    },
    view: (vnode) => {
      const isForumDetail = vnode.attrs.pathInfo.mGroupId && !vnode.attrs.pathInfo.mMsgId;
      const isThreadDetail = vnode.attrs.pathInfo.mGroupId && vnode.attrs.pathInfo.mMsgId;
      return m('.widget', {
        class: isForumDetail ? 'forums-detail-widget' : isThreadDetail ? 'forums-thread-widget' : '',
      }, [
        //  Only the list views get a page header: a forum and a thread carry
        //  their own heading, which is the forum's name rather than the tab's.
        !isForumDetail && !isThreadDetail && m(widget.PageHead, {
          title: pageTitles[vnode.attrs.pathInfo.tab] || 'Forums',
          actions: [
            vnode.attrs.pathInfo.tab === 'MyForums' &&
              m('button.forums-create-button.is-primary', {
                onclick: createForum,
              }, [icon('plus'), 'Create Forum']),
            m(util.SearchBar, {
              list: getForums.All,
            }),
          ],
        }),
        Object.prototype.hasOwnProperty.call(vnode.attrs.pathInfo, 'mMsgId') // thread's view
          ? m(viewUtil.ThreadView, {
            msgId: vnode.attrs.pathInfo.mMsgId,
            forumId: vnode.attrs.pathInfo.mGroupId,
          })
          : Object.prototype.hasOwnProperty.call(vnode.attrs.pathInfo, 'mGroupId') // Forum's view
            ? m(viewUtil.ForumView, {
              id: vnode.attrs.pathInfo.mGroupId,
              onSubscriptionChange: getForums.load,
            })
            : m(sections[vnode.attrs.pathInfo.tab], {
              list: getForums[vnode.attrs.pathInfo.tab],
              onCreateForum: createForum,
            }),
      ]);
    },
  };
};

module.exports = {
  view: (vnode) => {
    return [
      m(widget.Sidebar, {
        tabs: Object.keys(sections),
        baseRoute: '/forums/',
        mobileDrawer: true,
        title: 'Forums',
        labels: navLabels,
        icons: navIcons,
      }),
      m('.node-panel', m(Layout, { pathInfo: vnode.attrs })),
    ];
  },
};
