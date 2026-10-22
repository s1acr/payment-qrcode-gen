/* 二维码美化:canvas 合成中心 logo、底部文字条 */
(function () {
  'use strict';

  /* ---- 内联 logo(SVG data URI,避免 file:// 下跨域污染 canvas) ---- */

  var SVG_ALIPAY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" rx="22" fill="#1677ff"/>' +
    '<text x="50" y="52" font-size="54" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="PingFang SC,Microsoft YaHei,sans-serif">支</text>' +
    '</svg>';

  var SVG_WECHAT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" rx="22" fill="#07c160"/>' +
    '<g fill="#fff">' +
    '<ellipse cx="57" cy="40" rx="23" ry="18"/>' +
    '<ellipse cx="41" cy="63" rx="18" ry="14"/>' +
    '</g>' +
    '<g fill="#07c160">' +
    '<circle cx="49" cy="36" r="3.2"/><circle cx="65" cy="36" r="3.2"/>' +
    '<circle cx="35" cy="60" r="2.6"/><circle cx="47" cy="60" r="2.6"/>' +
    '</g>' +
    '</svg>';

  var SVG_COMBINED =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<circle cx="50" cy="50" r="50" fill="#fff"/>' +
    '<path d="M50 4A46 46 0 0 0 50 96Z" fill="#1677ff"/>' +
    '<path d="M50 4A46 46 0 0 1 50 96Z" fill="#07c160"/>' +
    '<text x="26" y="51" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="PingFang SC,Microsoft YaHei,sans-serif">支</text>' +
    '<g fill="#fff">' +
    '<ellipse cx="70" cy="42" rx="15" ry="12"/>' +
    '<ellipse cx="61" cy="59" rx="12" ry="10"/>' +
    '</g>' +
    '<g fill="#07c160">' +
    '<circle cx="65" cy="40" r="2.1"/><circle cx="75" cy="40" r="2.1"/>' +
    '<circle cx="57" cy="57" r="1.8"/><circle cx="65" cy="57" r="1.8"/>' +
    '</g>' +
    '</svg>';

  function svgUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var LOGOS = {
    alipay: svgUri(SVG_ALIPAY),
    wechat: svgUri(SVG_WECHAT),
    combined: svgUri(SVG_COMBINED)
  };

  function loadLogo(name) {
    return new Promise(function (resolve) {
      if (!name || !LOGOS[name]) { resolve(null); return; }
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); }; /* logo 加载失败则静默跳过 */
      img.src = LOGOS[name];
    });
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * 在原始 QR canvas 基础上合成美化效果
   * @param {HTMLCanvasElement} qrCanvas 已生成的二维码 canvas
   * @param {Object} opts { logo: 'combined'|'alipay'|'wechat'|'none', caption: '底部文字'|'' }
   * @returns {Promise<HTMLCanvasElement>} 最终成品 canvas
   */
  function compose(qrCanvas, opts) {
    opts = opts || {};
    var pad = 32;                       /* 四周留白(quiet zone) */
    var qrSize = qrCanvas.width;
    var caption = String(opts.caption || '').trim();
    var captionH = caption ? 68 : 0;

    return loadLogo(opts.logo).then(function (logoImg) {
      var W = qrSize + pad * 2;
      var H = qrSize + pad * 2 + captionH;
      var out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      var ctx = out.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(qrCanvas, pad, pad, qrSize, qrSize);

      if (logoImg) {
        var ls = Math.round(qrSize * 0.2); /* logo 占比 20%,配合 H 级纠错 */
        var lx = Math.round(pad + (qrSize - ls) / 2);
        var ly = Math.round(pad + (qrSize - ls) / 2);
        ctx.save();
        roundRectPath(ctx, lx - 8, ly - 8, ls + 16, ls + 16, 14);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        ctx.drawImage(logoImg, lx, ly, ls, ls);
      }

      if (caption) {
        ctx.fillStyle = '#1c2333';
        ctx.font = 'bold 32px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(caption, W / 2, pad * 2 + qrSize + captionH / 2, W - 48);
      }

      return out;
    });
  }

  window.PQBeautify = { compose: compose };
})();
