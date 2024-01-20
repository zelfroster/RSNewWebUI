const m = require('mithril');
const widget = require('components/widgets');
const rs = require('rswebui');
const util = require('pages/forums/forums_util');
const viewUtil = require('pages/forums/forum_view');
const peopleUtil = require('pages/people/people_util');

const getForums = {
  All: [],
  PopularForums: [],
  SubscribedForums: [],
  MyForums: [],
  async load() {
    const res = await rs.rsJsonApiRequest('/rsgxsforums/getForumsSummaries');
    getForums.All = res.body.forums;
    getForums.PopularForums = getForums.All;
    getForums.SubscribedForums = getForums.All.filter(
      (forum) =>
        forum.mSubscribeFlags === util.GROUP_SUBSCRIBE_SUBSCRIBED ||
        forum.mSubscribeFlags === util.GROUP_MY_FORUM
    );
    getForums.MyForums = getForums.All.filter(
      (forum) => forum.mSubscribeFlags === util.GROUP_MY_FORUM
    );
  },
};
const sections = {
  MyForums: require('pages/forums/my_forums'),
  SubscribedForums: require('pages/forums/subscribed_forums'),
  PopularForums: require('pages/forums/popular_forums'),
  OtherForums: require('pages/forums/other_forums'),
};

const Layout = () => {
  let ownId;

  return {
    oninit: () => {
      rs.setBackgroundTask(getForums.load, 5000, () => {
        // return m.route.get() === '/files/files';
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
    view: (vnode) =>
      m('.widget', [
        m('.top-heading', [
          m(
            'button',
            {
              onclick: () =>
                ownId &&
                util.popupmessage(
                  m(viewUtil.createforum, {
                    authorId: ownId,
                  })
                ),
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
            })
          : m(sections[vnode.attrs.pathInfo.tab], {
              list: getForums[vnode.attrs.pathInfo.tab],
            }),
      ]),
  };
};

module.exports = {
  view: (vnode) => {
    return [
      m(widget.Sidebar, {
        tabs: Object.keys(sections),
        baseRoute: '/forums/',
      }),
      m('.node-panel', m(Layout, { pathInfo: vnode.attrs })),
    ];
  },
};
