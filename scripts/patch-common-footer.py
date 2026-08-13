from pathlib import Path

index = Path('public/index.html')
text = index.read_text(encoding='utf-8')
old = '<div class="tech-support">技术支持：<a href="https://buer.top" target="_blank" rel="noopener">布尔信息科技(山东)有限公司</a></div>'
new = '<div data-common-tech-support></div>'
if old in text:
    text = text.replace(old, new, 1)
if '/common-footer.js' not in text:
    text = text.replace('</body>', '  <script src="/common-footer.js"></script>\n</body>', 1)
index.write_text(text, encoding='utf-8')

match = Path('public/match.html')
text = match.read_text(encoding='utf-8')
if '/common-footer.js' not in text:
    text = text.replace('</body>', '  <script src="/common-footer.js"></script>\n</body>', 1)
match.write_text(text, encoding='utf-8')
