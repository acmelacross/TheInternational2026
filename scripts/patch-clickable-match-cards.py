from pathlib import Path

app = Path('public/app.js')
s = app.read_text(encoding='utf-8')

old = "return `<article class=\"match-card ${cn ? 'cn-match' : ''}\">"
new = "return `<article class=\"match-card ${cn ? 'cn-match' : ''}\" data-detail-href=\"${detailsHref(m)}\" role=\"link\" tabindex=\"0\" aria-label=\"查看 ${escapeHtml(a.name)} 对阵 ${escapeHtml(b.name)} 的比赛详情\">"
if old not in s:
    raise SystemExit('match-card marker not found')
s = s.replace(old, new, 1)

marker = "function bindReminderButtons() {\n"
insert = (
    "function bindMatchCardNavigation() {\n"
    "  if (document.documentElement.dataset.matchCardNavigationBound === '1') return;\n"
    "  document.documentElement.dataset.matchCardNavigationBound = '1';\n"
    "  document.addEventListener('click', e => {\n"
    "    const card = e.target.closest('.match-card[data-detail-href]');\n"
    "    if (!card) return;\n"
    "    if (e.target.closest('a,button,input,select,textarea,[role=\\\"button\\\"]')) return;\n"
    "    location.href = card.dataset.detailHref;\n"
    "  });\n"
    "  document.addEventListener('keydown', e => {\n"
    "    const card = e.target.closest('.match-card[data-detail-href]');\n"
    "    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;\n"
    "    if (e.target.closest('a,button,input,select,textarea,[role=\\\"button\\\"]')) return;\n"
    "    e.preventDefault();\n"
    "    location.href = card.dataset.detailHref;\n"
    "  });\n"
    "}\n"
)
if 'function bindMatchCardNavigation()' not in s:
    if marker not in s:
        raise SystemExit('bindReminderButtons marker not found')
    s = s.replace(marker, insert + marker, 1)

end_marker = "setupSectionNav();\narmLocalReminders();\nload(false);"
new_end = "setupSectionNav();\nbindMatchCardNavigation();\narmLocalReminders();\nload(false);"
if end_marker not in s:
    raise SystemExit('startup marker not found')
s = s.replace(end_marker, new_end, 1)
app.write_text(s, encoding='utf-8')

css = Path('public/v135.css')
c = css.read_text(encoding='utf-8')
block = (
    "\n\n/* clickable match cards */\n"
    ".match-card[data-detail-href]{cursor:pointer;transition:border-color .15s ease,background .15s ease,transform .15s ease}\n"
    ".match-card[data-detail-href]:hover{border-color:rgba(117,174,232,.42);background:#101720;transform:translateY(-1px)}\n"
    ".match-card[data-detail-href]:focus-visible{outline:2px solid rgba(117,174,232,.7);outline-offset:2px}\n"
    ".match-card[data-detail-href].cn-match:hover{border-color:rgba(217,180,94,.48)}\n"
)
if '/* clickable match cards */' not in c:
    c += block
css.write_text(c, encoding='utf-8')
