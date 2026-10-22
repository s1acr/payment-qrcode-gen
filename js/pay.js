/* 中转页逻辑:解析 hash 参数 → 按 User-Agent 分流 */
(function () {
  'use strict';

  var app = document.getElementById('app');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseHashParams() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var out = {};
    raw.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      if (i <= 0) return;
      var k = kv.slice(0, i);
      var v = kv.slice(i + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, '%20')); } catch (e) { /* 保留原值 */ }
      out[k] = v;
    });
    return out;
  }

  function card(html) {
    app.innerHTML = '<div class="card">' + html + '</div>';
  }

  function copyText(text, cb) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        cb(ok);
      } catch (e) { cb(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
    } else {
      fallback();
    }
  }

  function bindCopyButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        copyText(btn.getAttribute('data-copy'), function (ok) {
          btn.textContent = ok ? '已复制 ✓' : '复制失败,请长按链接手动复制';
          btn.classList.toggle('ok', ok);
          setTimeout(function () {
            btn.textContent = '复制链接';
            btn.classList.remove('ok');
          }, 2000);
        });
      });
    });
  }

  var params = parseHashParams();
  var ua = navigator.userAgent || '';
  var isAlipay = /AlipayClient/i.test(ua) || /AliApp\(AP/i.test(ua);
  var isWeixin = /MicroMessenger/i.test(ua);

  function isValidPayUrl(u) {
    return /^(https?:\/\/|wxp:\/\/|alipays:\/\/)/i.test(u);
  }
  var alipay = isValidPayUrl((params.a || '').trim()) ? params.a.trim() : '';
  var wechat = isValidPayUrl((params.w || '').trim()) ? params.w.trim() : '';

  if (!alipay && !wechat) {
    card('<h1>无效的收款码</h1><p>二维码数据缺失或已损坏,<br>请联系收款方重新生成。</p>');
    return;
  }

  /* 支付宝扫码 → 直接跳转收款链接 */
  if (isAlipay && alipay) {
    card('<div class="spinner"></div><h1>正在打开支付宝收款…</h1><p>请稍候</p>');
    setTimeout(function () { location.replace(alipay); }, 60);
    return;
  }

  /* 微信扫码 */
  if (isWeixin && wechat) {
    if (/^https?:\/\//i.test(wechat)) {
      card('<div class="spinner"></div><h1>正在打开微信收款…</h1><p>请稍候</p>');
      setTimeout(function () { location.replace(wechat); }, 60);
      return;
    }
    /* wxp:// 无法通过网页跳转拉起支付,渲染二维码供长按识别 */
    renderWxpLongPress(wechat);
    return;
  }

  /* 其他浏览器,或 App 内缺少对应链接 */
  renderGeneric();

  function renderWxpLongPress(wxpUrl) {
    app.innerHTML =
      '<div class="card">' +
      '<h1>微信扫码付款</h1>' +
      '<p>请<strong>长按下方二维码</strong>,<br>选择「识别图中二维码」完成付款</p>' +
      '<div class="qr-box" id="qrBox"><div class="spinner" style="margin:98px auto"></div></div>' +
      '<div class="tip">如长按无反应,可先截图,再打开微信「扫一扫 → 相册」选择截图识别</div>' +
      '</div>';
    var canvas = document.createElement('canvas');
    window.QRCode.toCanvas(canvas, wxpUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    }, function (err) {
      var box = document.getElementById('qrBox');
      if (!box) return;
      if (err) {
        box.innerHTML = '<p style="line-height:240px">二维码渲染失败</p>';
        return;
      }
      /* 转成 img,微信内长按识别兼容性更好 */
      try {
        var img = new Image();
        img.alt = '微信收款码';
        img.width = 240;
        img.height = 240;
        img.src = canvas.toDataURL('image/png');
        img.onload = function () { box.replaceChild(img, box.firstChild); };
        img.onerror = function () { box.replaceChild(canvas, box.firstChild); };
      } catch (e) {
        box.replaceChild(canvas, box.firstChild);
      }
    });
  }

  function renderGeneric() {
    var title, desc;
    if (isAlipay && !alipay) {
      title = '暂时无法完成付款';
      desc = '此收款码未包含支付宝收款链接,请改用微信「扫一扫」。';
    } else if (isWeixin && !wechat) {
      title = '暂时无法完成付款';
      desc = '此收款码未包含微信收款链接,请改用支付宝「扫一扫」。';
    } else {
      title = '请使用支付宝或微信扫码';
      desc = '此收款码需要在支付宝或微信内打开,普通浏览器无法直接付款。你也可以复制下方链接,粘贴到对应 App 中打开。';
    }
    var html = '<h1>' + esc(title) + '</h1><p>' + esc(desc) + '</p><div class="links">';
    if (alipay) html += linkRow('a', '支付宝收款链接', alipay);
    if (wechat) html += linkRow('w', '微信收款链接', wechat);
    html += '</div>';
    card(html);
    bindCopyButtons();
  }

  function linkRow(kind, label, url) {
    return '<div class="link-row">' +
      '<div class="label"><span class="dot ' + kind + '"></span>' + esc(label) + '</div>' +
      '<div class="val">' + esc(url) + '</div>' +
      '<button class="btn" data-copy="' + esc(url) + '">复制链接</button>' +
      '</div>';
  }
})();
