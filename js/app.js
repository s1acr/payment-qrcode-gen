/* 主页逻辑:上传/粘贴 → 解码 → 生成合并码 → 下载 / 历史 */
(function () {
  'use strict';

  var state = {
    alipay: null, /* { url, dataUrl|null } */
    wechat: null,
    last: null    /* { payUrl, dataUrl, name, opts } */
  };

  function $(id) { return document.getElementById(id); }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2600);
  }

  /* ---------- 工具 ---------- */
  function siteBase() {
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }
  function buildPayUrl(a, w) {
    return siteBase() + 'pay.html#a=' + encodeURIComponent(a) + '&w=' + encodeURIComponent(w);
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30) || 'merged';
  }
  function copyText(text) {
    return new Promise(function (resolve) {
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
          resolve(ok);
        } catch (e) { resolve(false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
      } else {
        fallback();
      }
    });
  }
  function triggerDownload(dataUrl, filename) {
    var a = document.createElement('a');
    a.download = filename;
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ---------- file:// 检测 ---------- */
  var isFileProtocol = location.protocol === 'file:';
  function isLocalHost() {
    return /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i.test(location.hostname);
  }
  if (isFileProtocol) $('file-banner').hidden = false;

  /* ---------- 上传卡片 ---------- */
  function currentOptions() {
    var fgEl = document.querySelector('#opt-fg input:checked');
    var logoEl = document.querySelector('#opt-logo input:checked');
    return {
      fg: fgEl ? fgEl.value : '#000000',
      logo: logoEl ? logoEl.value : 'none',
      caption: $('opt-caption-on').checked ? $('opt-caption-text').value.trim() : ''
    };
  }

  function showState(channel, which) { /* empty | loading | done */
    $('empty-' + channel).hidden = which !== 'empty';
    $('loading-' + channel).hidden = which !== 'loading';
    $('done-' + channel).hidden = which !== 'done';
  }

  function setTypeBadge(channel, url) {
    var badge = $('type-' + channel);
    var kind = window.PQDecode.classify(url);
    badge.className = 'type-badge';
    if (kind === channel) {
      badge.classList.add('ok');
      badge.textContent = channel === 'alipay' ? '✓ 支付宝收款码' : '✓ 微信收款码';
    } else if (kind === 'unknown') {
      badge.classList.add('warn');
      badge.textContent = '未识别的类型,请自行确认链接无误';
    } else {
      badge.classList.add('warn');
      badge.textContent = channel === 'alipay' ? '疑似微信收款码链接' : '疑似支付宝收款码链接';
    }
  }

  var swapping = false;
  function checkSwap() {
    if (swapping || !state.alipay || !state.wechat) return;
    var ca = window.PQDecode.classify(state.alipay.url);
    var cw = window.PQDecode.classify(state.wechat.url);
    if (ca === 'wechat' && cw === 'alipay') {
      swapping = true;
      var a = state.alipay, w = state.wechat;
      setChannel('alipay', w);
      setChannel('wechat', a);
      swapping = false;
      toast('检测到两张码放反了,已自动互换');
    }
  }

  function setChannel(channel, value) { /* value: {url, dataUrl} | null */
    state[channel] = value;
    if (!value) {
      showState(channel, 'empty');
      $('file-' + channel).value = '';
    } else {
      showState(channel, 'done');
      var img = $('preview-' + channel);
      if (value.dataUrl) {
        img.src = value.dataUrl;
        img.hidden = false;
      } else {
        img.hidden = true; /* 手动粘贴无预览图 */
      }
      var urlEl = $('url-' + channel);
      urlEl.textContent = value.url;
      urlEl.title = value.url;
      setTypeBadge(channel, value.url);
    }
    checkSwap();
    refreshGenerateButton();
  }

  function handleFile(channel, file) {
    if (!file) return;
    var old = state[channel];
    showState(channel, 'loading');
    window.PQDecode.decodeFile(file).then(function (r) {
      setChannel(channel, { url: r.url, dataUrl: r.dataUrl });
      toast((channel === 'alipay' ? '支付宝' : '微信') + '收款码识别成功');
    }).catch(function (err) {
      if (old) {
        setChannel(channel, old); /* 恢复原值 */
      } else {
        showState(channel, 'empty');
        $('file-' + channel).value = '';
      }
      toast(err.message || '识别失败', 3800);
      var details = document.querySelector('#card-' + channel + ' .manual');
      if (details) details.open = true; /* 引导手动粘贴 */
    });
  }

  ['alipay', 'wechat'].forEach(function (ch) {
    var drop = $('drop-' + ch);
    var input = $('file-' + ch);

    drop.addEventListener('click', function (e) {
      if (e.target.closest('button')) return; /* 重新选择按钮不触发选文件 */
      input.click();
    });
    input.addEventListener('change', function () {
      handleFile(ch, input.files && input.files[0]);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('dragover');
      });
    });
    drop.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      handleFile(ch, files && files[0]);
    });
    $('reset-' + ch).addEventListener('click', function (e) {
      e.stopPropagation();
      setChannel(ch, null);
    });
    $('manual-ok-' + ch).addEventListener('click', function () {
      var v = $('manual-' + ch).value.trim();
      if (!v) { toast('请先输入收款链接'); return; }
      if (!/^(https?:\/\/|wxp:\/\/|alipays:\/\/)/i.test(v)) {
        toast('链接格式似乎不正确,应以 https:// 、wxp:// 或 alipays:// 开头', 3800);
        return;
      }
      setChannel(ch, { url: v, dataUrl: null });
      toast('已使用手动输入的链接');
    });
    $('manual-' + ch).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('manual-ok-' + ch).click();
    });
  });

  /* 阻止拖到页面其他区域时浏览器直接打开图片 */
  ['dragover', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });

  /* 全局粘贴图片 → 放入第一个空槽位 */
  document.addEventListener('paste', function (e) {
    var files = (e.clipboardData && e.clipboardData.files) || [];
    var file = null;
    for (var i = 0; i < files.length; i++) {
      if (/^image\//.test(files[i].type)) { file = files[i]; break; }
    }
    if (!file) return;
    var target = !state.alipay ? 'alipay' : (!state.wechat ? 'wechat' : null);
    if (!target) {
      toast('两个槽位都已有内容,请点击对应卡片的「重新选择」替换', 3200);
      return;
    }
    handleFile(target, file);
  });

  /* ---------- 选项联动 ---------- */
  $('opt-caption-on').addEventListener('change', function () {
    $('opt-caption-text').disabled = !this.checked;
  });

  /* ---------- 生成 ---------- */
  function refreshGenerateButton() {
    var ready = !!(state.alipay && state.wechat);
    var btn = $('btn-generate');
    btn.disabled = !ready || isFileProtocol;
    var hint = $('gen-hint');
    if (!ready) {
      hint.textContent = '请先完成上方两张收款码的上传/粘贴';
    } else if (isFileProtocol) {
      hint.textContent = 'file:// 方式打开无法生成有效合并码,请通过本地服务器或部署后的网址访问(见 README)';
    } else if (isLocalHost()) {
      hint.textContent = '两个链接已就绪;但当前是本机地址,手机扫码打不开——部署后或改用局域网 IP 打开本工具再生成(见 README)';
    } else {
      hint.textContent = '两个链接已就绪,点击生成';
    }
  }

  /* 品牌色亮度偏高(微信绿与白底对比仅约 2.4:1,支付宝蓝约 4.1:1),
     多数扫码器要求 ≥4:1;输出时映射为同色相的深色变体,界面色板仍展示品牌色。
     历史记录里存的老值也经此映射,一并修正。 */
  var SCAN_SAFE_FG = { '#07c160': '#05793d', '#1677ff': '#0b62d9' };
  function scanSafeFg(fg) {
    var k = String(fg || '').trim().toLowerCase();
    return SCAN_SAFE_FG[k] || k || '#000000';
  }

  function renderQR(payUrl, opts) {
    var withLogo = opts.logo && opts.logo !== 'none';
    return window.QRCode.toCanvas(payUrl, {
      width: 560,
      margin: 2,
      errorCorrectionLevel: withLogo ? 'H' : 'M',
      color: { dark: scanSafeFg(opts.fg), light: '#ffffff' }
    }).then(function (qrCanvas) {
      return window.PQBeautify.compose(qrCanvas, opts);
    });
  }

  $('btn-generate').addEventListener('click', function () {
    if (!state.alipay || !state.wechat) return;
    if (isFileProtocol) {
      toast('当前通过 file:// 打开,无法生成可扫码的合并码,请使用本地服务器(见 README)', 4200);
      return;
    }
    var opts = currentOptions();
    var name = $('gen-name').value.trim();
    var payUrl = buildPayUrl(state.alipay.url, state.wechat.url);

    var btn = $('btn-generate');
    btn.disabled = true;
    btn.textContent = '生成中…';

    renderQR(payUrl, opts).then(function (canvas) {
      var dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        throw new Error('导出图片失败(canvas 被污染)');
      }
      $('result-img').src = dataUrl;
      $('result-name').textContent = name ? '备注:' + name : '';
      var warnEl = $('result-warn');
      var warns = [];
      if (payUrl.length > 600) {
        warns.push('链接内容较长,二维码较密集:打印时请放大,并务必用真机实测扫码。');
      }
      if (isLocalHost()) {
        warns.push('二维码指向本机地址,手机扫码打不开:请部署到静态托管,或改用电脑的局域网 IP 访问本工具后重新生成。');
      }
      warnEl.hidden = warns.length === 0;
      warnEl.textContent = warns.join('');
      $('result-card').hidden = false;
      $('result-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.last = { payUrl: payUrl, dataUrl: dataUrl, name: name };

      window.PQStore.add({
        name: name,
        alipay: state.alipay.url,
        wechat: state.wechat.url,
        payUrl: payUrl,
        logo: opts.logo,
        fg: opts.fg,
        caption: opts.caption
      });
      renderHistory();
      toast('已生成并保存到历史记录');
    }).catch(function (err) {
      console.error(err);
      toast('生成失败:' + (err && err.message ? err.message : err), 3800);
    }).then(function () {
      btn.textContent = '生成合并收款码';
      refreshGenerateButton();
    });
  });

  $('btn-download').addEventListener('click', function () {
    if (!state.last) return;
    triggerDownload(state.last.dataUrl, '收款码_' + safeName(state.last.name) + '.png');
  });

  $('btn-copy-url').addEventListener('click', function () {
    if (!state.last) return;
    copyText(state.last.payUrl).then(function (ok) {
      toast(ok ? '扫码链接已复制' : '复制失败,请手动选择链接复制');
    });
  });

  /* ---------- 历史记录 ---------- */
  function mkBtn(text, fn, danger) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small' + (danger ? ' btn-danger-ghost' : '');
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function regenFromRecord(rec) {
    var payUrl = rec.payUrl || buildPayUrl(rec.alipay || '', rec.wechat || '');
    renderQR(payUrl, {
      fg: rec.fg || '#000000',
      logo: rec.logo || 'none',
      caption: rec.caption || ''
    }).then(function (canvas) {
      triggerDownload(canvas.toDataURL('image/png'), '收款码_' + safeName(rec.name) + '.png');
      toast('已重新生成并开始下载');
    }).catch(function (err) {
      toast('生成失败:' + (err && err.message ? err.message : err), 3800);
    });
  }

  function renderHistory() {
    var list = window.PQStore.list();
    var ul = $('history-list');
    ul.innerHTML = '';
    $('history-empty').hidden = list.length > 0;
    $('btn-clear-history').hidden = list.length === 0;

    list.forEach(function (rec) {
      var li = document.createElement('li');
      li.className = 'hist-item';

      var main = document.createElement('div');
      main.className = 'hist-main';

      var nameEl = document.createElement('div');
      nameEl.className = 'hist-name';
      nameEl.textContent = rec.name || '未命名收款码';
      main.appendChild(nameEl);

      var meta = document.createElement('div');
      meta.className = 'hist-meta';
      if (rec.alipay) {
        var da = document.createElement('span');
        da.className = 'dot a';
        da.title = '支付宝';
        meta.appendChild(da);
      }
      if (rec.wechat) {
        var dw = document.createElement('span');
        dw.className = 'dot w';
        dw.title = '微信';
        meta.appendChild(dw);
      }
      var time = document.createElement('span');
      time.textContent = fmtDate(rec.createdAt);
      meta.appendChild(time);
      main.appendChild(meta);

      var mismatch = false;
      try {
        mismatch = rec.payUrl && new URL(rec.payUrl).origin !== location.origin;
      } catch (e) { /* 忽略 */ }
      if (mismatch) {
        var w = document.createElement('div');
        w.className = 'hist-warn';
        w.textContent = '生成时的域名与当前不同,二维码内容仍为旧链接';
        main.appendChild(w);
      }

      var actions = document.createElement('div');
      actions.className = 'hist-actions';
      actions.appendChild(mkBtn('重新生成下载', function () { regenFromRecord(rec); }));
      actions.appendChild(mkBtn('复制链接', function () {
        copyText(rec.payUrl || '').then(function (ok) {
          toast(ok ? '扫码链接已复制' : '复制失败');
        });
      }));
      actions.appendChild(mkBtn('删除', function () {
        window.PQStore.remove(rec.id);
        renderHistory();
        toast('已删除该记录');
      }, true));

      li.appendChild(main);
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  $('btn-clear-history').addEventListener('click', function () {
    if (!window.confirm('确定清空全部历史记录吗?此操作不可恢复。')) return;
    window.PQStore.clear();
    renderHistory();
    toast('历史记录已清空');
  });

  /* ---------- 初始化 ---------- */
  renderHistory();
  refreshGenerateButton();
})();
