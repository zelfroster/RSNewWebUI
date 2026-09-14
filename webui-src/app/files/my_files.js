const m = require('mithril');
const rs = require('rswebui');
const util = require('files/files_util');
const manager = require('files/files_manager');
const icon = require('icon');
const widget = require('widgets');

const translateName = (name) => {
  const n = name.toLowerCase().trim();
  if (n === 'extra list' || n === '[extra list]') return 'Temporary shared files';
  // Match hex strings (IDs) or pure numeric strings
  if (/^[0-9a-fA-F]{16,}$/.test(name) || /^\d+$/.test(name)) return 'My Files';
  return name;
};

const DisplayFiles = () => {
  const childrenList = []; // stores children details
  let loaded = false; // checks whether we have loaded the children details or not.
  let parStruct; // stores current struct(details, showChild)
  return {
    oninit: (v) => {
      if (v.attrs.par_directory) {
        parStruct = v.attrs.par_directory;
      }
    },
    view: (v) => [
      m('tr', [
        parStruct && parStruct.details.children && parStruct.details.children.length
          ? m(
            'td',
            icon('angle-right', {
              class: parStruct.showChild ? 'icon--rot-90' : '',
              onclick: async () => {
                if (!loaded) {
                  // if it is not already retrieved
                  const results = await Promise.all(
                    parStruct.details.children.map((child) =>
                      rs.rsJsonApiRequest('/rsfiles/requestDirDetails', {
                        handle: child.handle.xint64,
                        flags: util.RS_FILE_HINTS_LOCAL,
                      })
                    )
                  );
                  results.forEach((res) => {
                    if (res && res.body && res.body.details) {
                      childrenList.push(res.body.details);
                    }
                  });
                  loaded = true;
                }
                parStruct.showChild = !parStruct.showChild;
              },
            })
          )
          : m('td', ''),
        m(
          'td',
          {
            style: {
              position: 'relative',
              '--replyDepth': v.attrs.replyDepth,
              left: `calc(1.5rem*${v.attrs.replyDepth})`,
            },
          },
          [
            parStruct.details.children !== undefined
              ? icon(parStruct.showChild ? 'folder-open' : 'folder', {
                  title: 'Folder',
                  class: 'files-folder-icon',
                })
              : null,
            translateName(parStruct.details.name || ''),
          ]
        ),
        m('td', rs.formatBytes((parStruct.details.size && parStruct.details.size.xint64) || 0)),
      ]),
      parStruct.showChild &&
      childrenList.map((child) =>
        m(DisplayFiles, {
          // recursive call
          par_directory: { details: child, showChild: false },
          replyDepth: v.attrs.replyDepth + 1,
        })
      ),
    ],
  };
};

const Layout = () => {
  let displayList = [];
  let isLoading = true;
  let showShareManager = false; // Retain original declaration

  return {
    oninit: () => {
      rs.rsJsonApiRequest('/rsfiles/requestDirDetails', {}).then(async (res) => {
        if (res && res.body && res.body.details) {
          if (res.body.details.name === 'root') {
            // Skip root and fetch full details for each child (Location ID, Extra list, etc)
            const results = await Promise.all(
              res.body.details.children.map((child) =>
                rs.rsJsonApiRequest('/rsfiles/requestDirDetails', {
                  handle: child.handle.xint64,
                  flags: util.RS_FILE_HINTS_LOCAL,
                })
              )
            );
            displayList = results.map((r) => r.body.details);
          } else {
            displayList = [res.body.details];
          }
        }
        isLoading = false;
        m.redraw();
      });
    },
    view: () => [
      m(widget.PageHead, {
        title: 'My Files',
        lead: 'The directories you share with your friends.',
        actions: m(
          'button.my-files__configure-shares.is-primary',
          {
            onclick: () => (showShareManager = true),
            title: 'Configure shared directories',
            'aria-label': 'Configure shared directories',
          },
          [icon('folder-plus'), m('span', 'Configure shared directories')]
        ),
      }),
      m('.widget__body', [
        m(
          util.MyFilesTable,
          m(
            'tbody',
            isLoading
              ? m('tr', m('td[colspan=3]', 'Loading...'))
              : displayList.map((details) =>
                m(DisplayFiles, {
                  par_directory: { details, showChild: false },
                  replyDepth: 0,
                })
              )
          )
        ),
        m(
          '.shareManagerPopupOverlay#shareManagerPopup',
          { style: { display: showShareManager ? 'block' : 'none' } },
          m(
            '.shareManagerPopup',
            m(manager),
            m(
              'button.red.close-btn',
              { onclick: () => (showShareManager = false) },
              icon('times')
            )
          )
        ),
      ]),
    ],
  };
};

module.exports = Layout;
