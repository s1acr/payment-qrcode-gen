/* 历史记录:localStorage CRUD(只存链接与备注,不存图片) */
(function () {
  'use strict';

  var KEY = 'pq_history_v1';
  var MAX = 50;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function write(arr) {
    try {
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
      return true;
    } catch (e) { return false; } /* 隐私模式下可能失败 */
  }

  window.PQStore = {
    list: function () { return read(); },

    /** 新增记录,返回带 id/createdAt 的完整记录 */
    add: function (rec) {
      var arr = read();
      var item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: rec.name || '',
        alipay: rec.alipay || '',
        wechat: rec.wechat || '',
        payUrl: rec.payUrl || '',
        logo: rec.logo || 'none',
        fg: rec.fg || '#000000',
        caption: rec.caption || '',
        createdAt: Date.now()
      };
      arr.unshift(item);
      write(arr);
      return item;
    },

    remove: function (id) {
      write(read().filter(function (r) { return r.id !== id; }));
    },

    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    }
  };
})();
