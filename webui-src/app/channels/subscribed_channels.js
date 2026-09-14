const m = require('mithril');
const util = require('channels/channels_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', [
        m('h3', 'Subscribed Channels'),
        //  Same phone-only create entry point as the sibling tabs.
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
                category: 'Subscribed',
              })
            ),
            v.attrs.list.map((channel) =>
              m(util.DisplayChannelsFromList, {
                id: channel.mGroupId,
                category: 'Subscribed',
              })
            ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;
