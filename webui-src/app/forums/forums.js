const m = require('mithril');
const rs = require('rswebui');
const util = require('forums/forums_util');
const viewUtil = require('forums/forum_view');
const peopleUtil = require('people/people_util');

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
  All: require('forums/popular_forums'),
  MyForums: require('forums/my_forums'),
  Subscribed: require('forums/subscribed_forums'),
  Popular: require('forums/popular_forums'),
  Other: require('forums/other_forums'),
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
      'create-forum-modal'
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
        m('.top-heading', [
          vnode.attrs.pathInfo.tab === 'MyForums' &&
          m(
            'button.forums-create-button',
            {
              onclick: createForum,
            },
            'Create Forum'
          ),
          m(util.SearchBar, {
            list: getForums.All,
          }),
        ]),
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
              list: vnode.attrs.pathInfo.tab === 'All'
                ? [...new Map([...(getForums.Popular || []), ...(getForums.Other || [])].map((item) => [item.mGroupId, item])).values()]
                : getForums[vnode.attrs.pathInfo.tab],
              title: vnode.attrs.pathInfo.tab === 'All' ? 'All Forums' : undefined,
              category: vnode.attrs.pathInfo.tab,
              onCreateForum: createForum,
            }),
      ]);
    },
  };
};

module.exports = {
  view: (vnode) => m(require('library_layout'), {
    title: 'Forums',
    icon: 'comments',
    tabs: Object.keys(sections).filter((tab) => tab !== 'All'),
    mobileTabs: [{ tab: 'MyForums', label: 'My' }, 'Subscribed', 'All'],
    baseRoute: '/forums/',
  }, m(Layout, { pathInfo: vnode.attrs })),
};
