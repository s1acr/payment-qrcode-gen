/* 图片解码:File → canvas → jsQR → 链接;以及链接类型识别 */
(function () {
  'use strict';

  var MAX_SIDE = 1600; /* 超大图先缩小再识别,提高速度与成功率 */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) {
        reject(new Error('请选择图片文件(JPG / PNG)'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('图片过大(超过 10MB)'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片无法解析,请换一张')); };
        img.onload = function () { resolve({ img: img, dataUrl: String(reader.result) }); };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function scanAt(img, scale) {
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h);
    var code = window.jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
    return code && code.data ? String(code.data).trim() : null;
  }

  /** 解码图片文件中的二维码,resolve { url, dataUrl } */
  function decodeFile(file) {
    return loadImage(file).then(function (r) {
      var img = r.img;
      var long = Math.max(img.naturalWidth, img.naturalHeight);
      var scales = long > MAX_SIDE ? [MAX_SIDE / long, 1] : [1];
      if (long < 200) scales.push(2); /* 小图放大再试 */
      var result = null;
      for (var i = 0; i < scales.length && !result; i++) {
        try { result = scanAt(img, scales[i]); } catch (e) { /* 继续尝试下一尺度 */ }
      }
      if (!result) {
        throw new Error('未能识别到二维码。请确保图片清晰完整,或改用「粘贴链接」方式');
      }
      return { url: result, dataUrl: r.dataUrl };
    });
  }

  /** 识别链接归属:alipay / wechat / unknown */
  function classify(url) {
    var u = String(url || '').trim();
    if (/^alipays:\/\//i.test(u)) return 'alipay';
    if (/^https?:\/\/[^/]*alipay\.com\//i.test(u)) return 'alipay';
    if (/^wxp:\/\//i.test(u)) return 'wechat';
    if (/^https?:\/\/[^/]*tenpay\.com\//i.test(u)) return 'wechat';
    if (/^https?:\/\/[^/]*wechatpay\.cn\//i.test(u)) return 'wechat';
    if (/^https?:\/\/[^/]*weixin\.qq\.com\//i.test(u)) return 'wechat';
    return 'unknown';
  }

  window.PQDecode = {
    decodeFile: decodeFile,
    classify: classify
  };
})();
