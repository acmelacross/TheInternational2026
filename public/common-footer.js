'use strict';

(() => {
  const company = '布尔信息科技(山东)有限公司';
  const href = 'https://buer.top';

  if (!document.getElementById('common-tech-footer-style')) {
    const style = document.createElement('style');
    style.id = 'common-tech-footer-style';
    style.textContent = `
      .common-tech-footer{border-top:1px solid rgba(255,255,255,.05);margin-top:28px;padding:22px 20px 34px;text-align:center;color:#5f6b79;font-size:10px}
      .tech-support{margin-top:7px;text-align:center;color:#5f6b79;font-size:10px}
      .tech-support a{color:#8d99a7;text-decoration:none;transition:color .15s ease}
      .tech-support a:hover{color:var(--gold,#d9b45e)}
    `;
    document.head.appendChild(style);
  }

  let host = document.querySelector('[data-common-tech-support]');
  if (!host) {
    const footer = document.createElement('footer');
    footer.className = 'common-tech-footer';
    footer.setAttribute('data-common-footer', '');
    host = document.createElement('div');
    host.setAttribute('data-common-tech-support', '');
    footer.appendChild(host);
    document.body.appendChild(footer);
  }

  host.classList.add('tech-support');
  host.replaceChildren();
  host.append('技术支持：');
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = company;
  host.appendChild(link);
})();
