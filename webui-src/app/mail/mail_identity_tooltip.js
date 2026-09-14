const m = require('mithril');
const rs = require('rswebui');
const peopleUtil = require('people/people_util');

function renderIdentityTooltip({ details, gxsId, name, rect, overlapAnchor = false, belowAnchor = false }) {
  if (!details || !rect) return null;

  const avatar = details.mAvatar && details.mAvatar.base64 ? details.mAvatar.base64 : details.mAvatar;
  const votes = details.mReputation
    ? (details.mReputation.mFriendsPositiveVotes || 0) -
      (details.mReputation.mFriendsNegativeVotes || 0)
    : 0;
  const tooltipWidth = 280;
  const gap = 10;
  let left = overlapAnchor ? rect.left + 90 : rect.right + gap;
  if (left + tooltipWidth > window.innerWidth - gap) left = rect.left - tooltipWidth - gap;
  if (left < gap) left = gap;
  let top = overlapAnchor ? rect.top - 10 : rect.top;
  if (top + 160 > window.innerHeight) top = window.innerHeight - 170;
  if (top < gap) top = gap;

  //  Measured after render: a long name or a full GXS id changes the box, and
  //  an unmeasured guess puts it off the bottom or the right of the viewport.
  const positionBelow = ({ dom }) => {
    const bounds = dom.getBoundingClientRect();
    const x = Math.max(gap, Math.min(rect.left, window.innerWidth - bounds.width - gap));
    const below = rect.bottom + 6;
    const y = below + bounds.height <= window.innerHeight - gap
      ? below : Math.max(gap, rect.top - bounds.height - 6);
    dom.style.left = `${x}px`;
    dom.style.top = `${y}px`;
  };
  if (belowAnchor) {
    left = rect.left;
    top = rect.bottom + 6;
  }

  return m('.user-tooltip', {
    oncreate: belowAnchor ? positionBelow : undefined,
    onupdate: belowAnchor ? positionBelow : undefined,
    style: { top: `${top}px`, left: `${left}px` },
  }, [
    m('.tooltip-avatar', m(peopleUtil.UserAvatar, {
      avatar,
      firstLetter: name,
      identityId: gxsId,
      size: 56,
      isSquare: true,
    })),
    m('.tooltip-details', [
      m('.tooltip-row', [m('span.tooltip-label', 'Identity name: '), m('span.tooltip-value', name)]),
      m('.tooltip-row', [m('span.tooltip-label', 'Identity Id: '), m('span.tooltip-value.tooltip-id', gxsId)]),
      details.mPgpId && details.mPgpId !== '0000000000000000' && m('.tooltip-row', [
        m('span.tooltip-label', 'Node: '),
        m('span.tooltip-value', `${rs.userList.username(details.mPgpId) || name} [${details.mPgpId}]`),
      ]),
      m('.tooltip-row', [
        m('span.tooltip-label', 'Votes: '),
        m('span.tooltip-value', {
          class: votes >= 0 ? 'is-positive' : 'is-negative',
        }, `${votes >= 0 ? '+' : ''}${votes}`),
      ]),
    ]),
  ]);
}

module.exports = renderIdentityTooltip;
