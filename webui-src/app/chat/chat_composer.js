const m = require('mithril');
const icon = require('icon');
const chatEmoji = require('chat/chat_emoji');
const { autoResizeTextarea } = require('chat/chat_state');

// -----------------------------------------------------------------------------
// The chat composer.
//
// One component for all three chat surfaces -- Network's direct chat, People's
// distant chat, and the Chat hub. They were three copies of the same ~170 lines:
// the same four tools, the same enter-to-send, the same paste-an-image handler,
// the same autosizing textarea. Changing the composer meant finding and editing
// all three, and they had already drifted -- different paddings, different
// radii, and in People's case a whole second palette written inline.
//
// Layout lives in scss/components/_chat-composer.scss. Nothing here sets style.
//
// attrs
//   value                the draft text
//   placeholder
//   disabled             tools and send are inert, e.g. while a tunnel opens
//   onInput(text)
//   onSend()
//   onAttachFile()       optional; omit and the paperclip is not rendered
//   onImage(file)        optional; omit and the image tool is not rendered
//   attachment           { dataUrl, name } or null
//   onRemoveAttachment()
//   onViewAttachment(dataUrl)
// -----------------------------------------------------------------------------

const ChatComposer = () => {
  let emojiOpen = false;

  //  Enter sends. Ctrl/Cmd+Enter and Shift+Enter insert a newline, which is
  //  what every chat client does and what people's fingers expect.
  const onKeyDown = (attrs) => (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!attrs.disabled) attrs.onSend();
  };

  const onPaste = (attrs) => (e) => {
    if (!attrs.onImage) return;
    const items = (e.clipboardData || {}).items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === -1) continue;
      e.preventDefault();
      attrs.onImage(items[i].getAsFile());
      return;
    }
  };

  const tool = (attrs, opts) => m('button.chat-composer__tool.chat-hub-action-btn[type=button]', {
    disabled: attrs.disabled,
    title: opts.title,
    'aria-label': opts.title,
    class: opts.on ? 'is-on' : '',
    'aria-pressed': opts.on === undefined ? undefined : String(opts.on),
    onclick: opts.onclick,
  }, icon(opts.icon));

  return {
    view: ({ attrs }) => [
      attrs.attachment && m('.chat-attachment-preview', [
        m('.chat-attachment-preview__item', [
          m('img.chat-attachment-preview__thumb', {
            src: attrs.attachment.dataUrl,
            alt: 'Preview',
            title: 'Click to view full image',
            onclick: () => attrs.onViewAttachment && attrs.onViewAttachment(attrs.attachment.dataUrl),
          }),
          m('button.chat-attachment-preview__remove[type=button]', {
            title: 'Remove image',
            onclick: () => attrs.onRemoveAttachment && attrs.onRemoveAttachment(),
          }, icon('times')),
        ]),
        m('.chat-attachment-preview__info', [
          m('span.chat-attachment-preview__name', attrs.attachment.name || 'Image attached'),
          m('span.chat-attachment-preview__hint', 'Will be sent with your message'),
        ]),
      ]),

      m('.chat-composer', [
        //  Attach, image, emoji -- one order, here and in the mail composer.
        attrs.onAttachFile && tool(attrs, {
          icon: 'paperclip',
          title: 'Attach file link',
          onclick: attrs.onAttachFile,
        }),

        //  A <label>, because it wraps the file input -- and `disabled` is not
        //  a valid attribute on one, so the browser ignores it. aria-disabled
        //  is what btn-base already styles, and the stylesheet takes the
        //  pointer events off it so it cannot be hovered or clicked either.
        attrs.onImage && m('label.chat-composer__tool.chat-hub-action-btn', {
          title: 'Send image',
          'aria-disabled': attrs.disabled ? 'true' : undefined,
        }, [
          icon('image'),
          m('input[type=file][accept=image/*].chat-composer__file', {
            disabled: attrs.disabled,
            onchange: (e) => {
              const file = e.target.files && e.target.files[0];
              if (file) attrs.onImage(file);
              e.target.value = '';
            },
          }),
        ]),

        m('.chat-composer__emoji', [
          tool(attrs, {
            icon: 'smile',
            title: 'Insert emoji',
            on: emojiOpen,
            onclick: (e) => {
              //  The picker ignores clicks that land inside itself; this stops
              //  the reopening click reaching its outside-click listener.
              e.stopPropagation();
              emojiOpen = !emojiOpen;
            },
          }),
          emojiOpen && m(chatEmoji.EmojiPicker, {
            onSelect: (emoji) => {
              attrs.onInput((attrs.value || '') + emoji);
              emojiOpen = false;
            },
            onClose: () => { emojiOpen = false; },
          }),
        ]),

        m('textarea.chat-composer__field[rows=1]', {
          placeholder: attrs.placeholder || 'Type a message here...',
          value: attrs.value || '',
          disabled: attrs.disabled,
          oncreate: (v) => autoResizeTextarea(v.dom),
          onupdate: (v) => autoResizeTextarea(v.dom),
          oninput: (e) => {
            attrs.onInput(e.target.value);
            autoResizeTextarea(e.target);
          },
          onpaste: onPaste(attrs),
          onkeydown: onKeyDown(attrs),
        }),

        m('button.chat-composer__send.is-primary[type=button]', {
          disabled: attrs.disabled,
          onclick: () => attrs.onSend(),
        }, [icon('paper-plane'), m('span.btn-text', 'Send')]),
      ]),
    ],
  };
};

module.exports = { ChatComposer };
