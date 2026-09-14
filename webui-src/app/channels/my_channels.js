const m = require('mithril');
const util = require('channels/channels_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', [
        m('h3', 'My Channels'),
        m('button.channels-heading-create[type=button][title=Create Channel][aria-label=Create Channel]', {
          onclick: v.attrs.onCreateChannel,
        }, m('i.fas.fa-plus')),
      ]),
      m('.widget__body', [
        m(
          util.ChannelTable,
          m('tbody', [
            v.attrs.list.map((channel) =>
              m(util.ChannelSummary, {
                details: channel,
                category: 'MyChannels',
              })
            ),
            v.attrs.list.map((channel) =>
              m(util.DisplayChannelsFromList, {
                id: channel.mGroupId,
                category: 'MyChannels',
              })
            ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;
