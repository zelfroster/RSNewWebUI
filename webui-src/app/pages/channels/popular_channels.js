const m = require('mithril');
const util = require('pages/channels/channels_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', m('h3', 'Popular Channels')),
      m('.widget__body', [
        m(
          util.ChannelTable,
          m('tbody', [
            v.attrs.list.map((channel) =>
              m(util.ChannelSummary, {
                details: channel,
                category: 'PopularChannels',
              })
            ),
            v.attrs.list.map((channel) =>
              m(util.DisplayChannelsFromList, {
                id: channel.mGroupId,
                category: 'PopularChannels',
              })
            ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;
