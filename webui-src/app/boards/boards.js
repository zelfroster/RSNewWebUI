const m = require('mithril');
const rs = require('rswebui');
const util = require('boards/boards_util');
const viewUtil = require('boards/board_view');
const peopleUtil = require('people/people_util');

const getBoards = {
  All: [],
  Popular: [],
  Subscribed: [],
  MyBoards: [],
  Other: [],
  async load() {
    try {
      const res = await rs.rsJsonApiRequest('/rsPosted/getBoardsSummaries');
      const boards = res && res.body && Array.isArray(res.body.groupInfo) ? res.body.groupInfo : null;
      if (!boards) {
        console.warn('Boards summaries response did not include groupInfo', res && res.body);
        return;
      }
      getBoards.All = boards;
      const popular = [...boards].sort((a, b) => (b.mPop || 0) - (a.mPop || 0));
      getBoards.Other = popular.slice(5);
      getBoards.Popular = popular.slice(0, 5);
      getBoards.Subscribed = boards.filter(
        (board) => board.mSubscribeFlags === util.GROUP_SUBSCRIBE_SUBSCRIBED
      );
      getBoards.MyBoards = boards.filter(
        (board) => board.mSubscribeFlags === util.GROUP_MY_BOARD
      );
      m.redraw();
    } catch (error) {
      console.warn('Failed to load board summaries', error);
    }
  },
};

//  Group lists change on the scale of a conversation, not of a frame.
const BOARD_LIST_REFRESH_MS = 30000;

const sections = {
  All: require('boards/popular_boards'),
  MyBoards: require('boards/my_boards'),
  Subscribed: require('boards/subscribed_boards'),
  Popular: require('boards/popular_boards'),
  Other: require('boards/other_boards'),
};

const Layout = () => {
  let ownId;
  const createBoard = () => ownId && util.popupmessage(
    m(viewUtil.createboard, { authorId: ownId, onCreated: getBoards.load }),
    'create-board-modal'
  );

  return {
    oninit: () => {
      rs.setBackgroundTask(getBoards.load, BOARD_LIST_REFRESH_MS, () => {
        return m.route.get().startsWith('/boards');
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
      m('.widget', {
        class: vnode.attrs.pathInfo.mGroupId && !vnode.attrs.pathInfo.mMsgId ? 'boards-detail-widget' : '',
      }, [
        m('.top-heading', {
          class: ['Subscribed', 'MyBoards', 'Popular', 'Other', 'All'].includes(vnode.attrs.pathInfo.tab) && !vnode.attrs.pathInfo.mGroupId
            ? 'boards-subscribed-list-toolbar' : '',
        }, [
          m(
            'button.boards-create-button',
            {
              class: ['Subscribed', 'MyBoards', 'Other', 'Popular', 'All'].includes(vnode.attrs.pathInfo.tab) || vnode.attrs.pathInfo.mGroupId
                ? 'boards-create-button--mobile-hidden' : '',
              onclick: createBoard,
            },
            'Create Board'
          ),
          m(util.SearchBar, {
            list: getBoards.All,
          }),
        ]),
        Object.prototype.hasOwnProperty.call(vnode.attrs.pathInfo, 'mMsgId')
          ? m(viewUtil.PostView, {
              msgId: vnode.attrs.pathInfo.mMsgId,
              forumId: vnode.attrs.pathInfo.mGroupId,
            })
          : Object.prototype.hasOwnProperty.call(vnode.attrs.pathInfo, 'mGroupId')
          ? m(viewUtil.BoardView, {
              id: vnode.attrs.pathInfo.mGroupId,
              onSubscriptionChange: getBoards.load,
            })
          : m(sections[vnode.attrs.pathInfo.tab], {
              list: vnode.attrs.pathInfo.tab === 'All'
                ? [...new Map([...(getBoards.Popular || []), ...(getBoards.Other || [])].map((item) => [item.mGroupId, item])).values()]
                : getBoards[vnode.attrs.pathInfo.tab],
              title: vnode.attrs.pathInfo.tab === 'All' ? 'All Boards' : undefined,
              category: vnode.attrs.pathInfo.tab,
              onCreateBoard: createBoard,
            }),
      ]),
  };
};

module.exports = {
  view: (vnode) => m(require('library_layout'), {
    title: 'Boards',
    icon: 'th-large',
    tabs: Object.keys(sections).filter((tab) => tab !== 'All'),
    mobileTabs: [{ tab: 'MyBoards', label: 'My' }, 'Subscribed', 'All'],
    baseRoute: '/boards/',
  }, m(Layout, { pathInfo: vnode.attrs })),
};
