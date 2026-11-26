const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const mithril = require('../app/mithril');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const Data = { Posts: {}, Comments: {}, Votes: {} };
  const requests = [];
  const widgets = { PageHead: { view() {} }, Loading: { view() {} }, ListError: { view() {} } };
  const util = { Data, FilesTable: { view() {} }, updatecontent: async () => false, updatedisplaychannels: async () => {} };
  const m = Object.assign((...args) => mithril(...args), {
    redraw() {}, trust: mithril.trust, route: { param: () => ({ tab: 'All', mGroupId: 'chan' }) },
  });
  const modules = {
    mithril: m,
    widgets,
    'channels/channels_util': util,
    rswebui: { formatBytes: String, rsJsonApiRequest: async (path, data) => { requests.push({ path, data }); return { body: {} }; } },
    'people/people_util': { ownIds: async (callback) => callback([]) },
    'files/files_downloads': { Downloads: { loadStatus() {} }, list: {} },
    comments: { CommentsSection: { view() {} } },
  };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../app/channels/channel_view'), 'utf8'), {
    module, console, require: (name) => modules[name] || (() => {}),
  });
  const component = module.exports.PostView();
  const vnode = { attrs: { channelId: 'chan', msgId: 'post' } };
  const post = { mMeta: { mMsgName: 'Recovered post' }, mMsg: 'Content', mFiles: [] };
  const store = () => { Data.Posts.chan = { post: { post } }; };
  const view = () => { component.onbeforeupdate(vnode); return component.view(vnode); };
  return { component, vnode, util, post, store, view, widgets, requests };
}

test('a failed direct request recovers from the channel fetch', async () => {
  const fixture = setup();
  const pending = deferred();
  fixture.util.updatedisplaychannels = () => pending.promise;
  const initialized = fixture.component.oninit(fixture.vnode);
  assert.equal(fixture.view()[1].children[0].tag, fixture.widgets.Loading);
  fixture.store();
  assert.equal(fixture.view()[0].attrs.title, 'Recovered post');
  pending.resolve();
  await initialized;
  assert.equal(fixture.view()[0].attrs.title, 'Recovered post');
});

test('a missing post offers retry and retry can load it', async () => {
  const fixture = setup();
  await fixture.component.oninit(fixture.vnode);
  const error = fixture.view()[1].children[0];
  assert.equal(error.tag, fixture.widgets.ListError);
  fixture.util.updatecontent = async () => { fixture.store(); return true; };
  await error.attrs.onretry();
  assert.equal(fixture.view()[0].attrs.title, 'Recovered post');
});

test('rejected requests settle to a retryable error', async () => {
  const fixture = setup();
  fixture.util.updatecontent = async () => { throw new Error('Direct request failed'); };
  fixture.util.updatedisplaychannels = async () => { throw new Error('Channel request failed'); };
  await fixture.component.oninit(fixture.vnode);
  assert.equal(fixture.view()[1].children[0].tag, fixture.widgets.ListError);
});

test('a direct success renders before the channel finishes loading', async () => {
  const fixture = setup();
  const pending = deferred();
  fixture.util.updatecontent = async () => { fixture.store(); return true; };
  fixture.util.updatedisplaychannels = () => pending.promise;
  const initialized = fixture.component.oninit(fixture.vnode);
  await Promise.resolve();
  assert.equal(fixture.view()[0].attrs.title, 'Recovered post');
  pending.resolve();
  await initialized;
});

test('cached and recovered attachments are checked once across redraws', async () => {
  const fixture = setup();
  fixture.post.mFiles = [{ mHash: 'hash', mName: 'File', mSize: { xint64: 1 } }];
  fixture.store();
  fixture.util.updatecontent = async () => assert.fail('Cached post fetched again');
  await fixture.component.oninit(fixture.vnode);
  fixture.view();
  fixture.view();
  assert.equal(fixture.requests.length, 1);
});
