const m = require('mithril');
const rs = require('rswebui');

const peopleUtil = require('pages/people/people_util');

const AllContacts = () => {
  const list = peopleUtil.sortUsers(rs.userList.users);
  return {
    view: () => {
      return m('.widget', [
        m('.widget__heading', [
          m('h3', 'Contacts', m('span.counter', list.length)),
          m(peopleUtil.SearchBar),
        ]),
        m('.widget__body', [list.map((id) => m(peopleUtil.regularcontactInfo, { id }))]),
      ]);
    },
  };
};

module.exports = {
  view: () => {
    return m(AllContacts);
  },
};
