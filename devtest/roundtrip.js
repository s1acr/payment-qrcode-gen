/* 开发自检:
 * 1) 用 vendor/qrcode.min.js 生成 QR 模块矩阵 → 手动光栅化为 RGBA → 用 vendor/jsQR.js 解码回环验证
 * 2) 验证 js/decode.js 的 classify 链接分类逻辑
 * 3) 验证合并码 pay.html#a=..&w=.. 的组装/解析回环
 * 运行:node devtest/roundtrip.js
 */
'use strict';

/* 浏览器全局的最小 stub,让 UMD 库能在 Node 中加载 */
global.self = global;
global.window = global;

const path = require('path');
const assert = require('assert');

const QRCode = require(path.join(__dirname, '..', 'js', 'vendor', 'qrcode.min.js'));
const jsQR = require(path.join(__dirname, '..', 'js', 'vendor', 'jsQR.js'));
const jsQRfn = jsQR.jsQR || jsQR.default || jsQR;

/* ---- 1. 生成 → 光栅化 → 解码 回环 ---- */
function rasterize(text, opts) {
  const qr = QRCode.create(text, Object.assign({ errorCorrectionLevel: 'M' }, opts));
  const size = qr.modules.size;
  const data = qr.modules.data;
  const scale = 8, margin = 4;
  const dim = (size + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(dim * dim * 4);
  for (let i = 0; i < dim * dim; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const py = margin * scale + r * scale + y;
          const px = margin * scale + c * scale + x;
          const idx = (py * dim + px) * 4;
          rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = 0;
        }
      }
    }
  }
  return { rgba, dim };
}

function roundtrip(name, text, opts) {
  const { rgba, dim } = rasterize(text, opts);
  const code = jsQRfn(rgba, dim, dim, { inversionAttempts: 'dontInvert' });
  assert.ok(code, `${name}: 解码失败(未识别到二维码)`);
  assert.strictEqual(code.data, text, `${name}: 解码内容与原文不一致`);
  console.log(`✓ [回环] ${name} (${text.length} 字符, ${dim}x${dim}px)`);
}

/* 典型链接样本 */
const ALIPAY_URL = 'https://qr.alipay.com/fkx09exampleBtGoLBxYr7cd5';
const WXP_URL = 'wxp://f2f0ExampleExampleExampleExampleExampleXXyZ123';
const TENPAY_URL = 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmmpaysuccess?transid=1234567890123456789&sign=ABCDEF0123456789ABCDEF0123456789&fee=100&mid=1230000101&tid=1234567890123456789123456789012&timestamp=1700000000&nonce_str=abcdef123456';

roundtrip('支付宝链接 QR', ALIPAY_URL);
roundtrip('微信 wxp 链接 QR', WXP_URL);

/* 合并码:模拟 index.html 生成 pay.html#a=..&w=.. 的内容 */
const payUrl = 'https://example.com/pay.html#a=' + encodeURIComponent(ALIPAY_URL) + '&w=' + encodeURIComponent(TENPAY_URL);
roundtrip('合并码(含长微信链接)', payUrl);
roundtrip('合并码(H 级纠错+logo 场景)', payUrl, { errorCorrectionLevel: 'H' });

/* ---- 2. classify 分类逻辑 ---- */
/* decode.js 依赖 window/document,这里仅取 classify:通过 stub 环境加载 */
global.document = { createElement: () => { throw new Error('not needed'); } };
global.location = { origin: 'https://example.com', pathname: '/index.html', protocol: 'https:', hash: '' };
require(path.join(__dirname, '..', 'js', 'decode.js'));
const classify = global.PQDecode.classify;

assert.strictEqual(classify(ALIPAY_URL), 'alipay');
assert.strictEqual(classify('alipays://platformapi/startapp?appId=20000123'), 'alipay');
assert.strictEqual(classify(WXP_URL), 'wechat');
assert.strictEqual(classify(TENPAY_URL), 'wechat');
assert.strictEqual(classify('https://payapp.wechatpay.cn/sjt/qr/AQHSH4zNOX6vM1foKpSIdSnI'), 'wechat');
assert.strictEqual(classify('https://example.com/foo'), 'unknown');
console.log('✓ [分类] classify: alipay / wechat / unknown 全部正确');

/* ---- 3. pay.html hash 解析回环(与 js/pay.js 相同算法) ---- */
function parseHashParams(hash) {
  const raw = hash.replace(/^#\/?/, '');
  const out = {};
  raw.split('&').forEach((kv) => {
    if (!kv) return;
    const i = kv.indexOf('=');
    if (i <= 0) return;
    const k = kv.slice(0, i);
    let v = kv.slice(i + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, '%20')); } catch (e) { /* keep */ }
    out[k] = v;
  });
  return out;
}
const hash = payUrl.slice(payUrl.indexOf('#'));
const parsed = parseHashParams(hash);
assert.strictEqual(parsed.a, ALIPAY_URL, 'hash 解析: 支付宝链接还原失败');
assert.strictEqual(parsed.w, TENPAY_URL, 'hash 解析: 微信链接还原失败');
console.log('✓ [解析] pay.html hash 参数 a/w 还原正确');

console.log('\n全部自检通过 ✅');
