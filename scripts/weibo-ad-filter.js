/* 微博国际版广告过滤 1.2.0；@author yuecheng */
(function () {
  "use strict";
  try {
    var m = /^https?:\/\/([^\/:?#]+)(?::\d+)?([^?#]*)/i.exec($request.url || "");
    if (!m || Number($response.statusCode) >= 400) return $done({});
    var host = m[1].toLowerCase(), path = m[2], route;
    if (/^m?api\.weibo\.(cn|com)$/.test(host)) {
      if (path === "/2/ad/weibointl") route = "ad";
      else if (/^\/2\/(statuses\/[a-z_\/]*timeline[a-z_\/]*|groups\/timeline|cardlist)$/.test(path)) route = "feed";
    } else if (host === "bootpreload.uve.weibo.com" && /^\/v\d+\/ad\/preload$/.test(path)) route = "preload";
    else if (host === "sdkapp.uve.weibo.com" && path === "/interface/sdk/sdkad.php") route = "sdk";
    else if (host === "wbapp.uve.weibo.com" && (path === "/wbapplua/wbpullad.lua" || path === "/preload/get_ad")) route = "splash";
    else if (/^weibointl\.api\.weibo\.(cn|com)$/.test(host) && path === "/portal.php") {
      m = /[?&]a=([^&#]*)/.exec($request.url);
      if (m && (m[1] === "get_coopen_ads" || m[1] === "open_app")) route = m[1];
    }
    if (!route || typeof $response.body !== "string") return $done({});
    var data, prefix = "", suffix = "", changed = false;
    try { data = JSON.parse($response.body); }
    catch (_) {
      m = route === "sdk" && /^(\s*)(\{[\s\S]*\})(\s*OK\s*)$/.exec($response.body);
      if (!m) return $done({});
      data = JSON.parse(m[2]); prefix = m[1]; suffix = m[3];
    }
    function obj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function set(o, k, v) {
      if (o[k] !== undefined && o[k] !== v) { o[k] = v; changed = true; }
    }
    function clear(o, k) {
      if (o && Array.isArray(o[k]) && o[k].length) { o[k].length = 0; changed = true; }
    }
    if (!obj(data) || data.ok === 0 ||
        (own(data, "error_code") && data.error_code !== 0 && data.error_code !== "0" && data.error_code !== "") ||
        (own(data, "errno") && Number(data.errno) !== 0) ||
        (!own(data, "errno") && own(data, "error") && Boolean(data.error))) return $done({});

    if (route === "ad") clear(data, "data");
    else if (route === "feed") {
      var keys = ["statuses", "cards", "items", "card_group"];
      var labels = ["广告", "廣告", "热推", "熱推", "荐读", "薦讀", "Sponsored"];
      function yes(v) { return v === true || v === 1 || v === "1"; }
      function ad(o) {
        return obj(o) && (yes(o.is_ad) || yes(o.is_ads) || yes(o.ad_marked) ||
          (obj(o.promotion) && o.promotion.type === "ad") || labels.indexOf(o.mblogtypename) >= 0 ||
          (obj(o.content_auth_info) && (o.content_auth_info.content_auth_title === "广告" || o.content_auth_info.content_auth_title === "廣告")) ||
          (obj(o.page_info) && obj(o.page_info.actionlog) && o.page_info.actionlog.source === "ad"));
      }
      function feed(o, depth) {
        if (!obj(o) || depth > 8) return;
        for (var k = 0; k < keys.length; k++) {
          var list = o[keys[k]];
          if (!Array.isArray(list)) continue;
          var n = 0;
          for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (obj(e)) {
              if (ad(e) || ad(e.mblog) || (e.category === "feed" && ad(e.data))) { changed = true; continue; }
              var groups = Array.isArray(e.card_group) && e.card_group.length;
              var items = Array.isArray(e.items) && e.items.length;
              feed(e, depth + 1);
              if (e.category === "group" || e.category === "card") feed(e.data, depth + 1);
              if ((groups && !e.card_group.length) || (e.category === "group" && items && !e.items.length)) { changed = true; continue; }
            }
            if (n !== i) list[n] = e;
            n++;
          }
          list.length = n;
        }
      }
      feed(data, 0); feed(data.data, 0);
      clear(data, "ad"); clear(data, "ads"); clear(data, "advertises"); clear(data, "ad_version_2_weibo");
      clear(data.data, "ad"); clear(data.data, "ads"); clear(data.data, "advertises"); clear(data.data, "ad_version_2_weibo");
    } else if (route === "get_coopen_ads" && obj(data.data)) {
      var config = data.data;
      var arrays = ["ad_list", "gdt_video_ad_ios", "pic_ad", "wax_days", "cyt_days"];
      for (var i = 0; i < arrays.length; i++) clear(config, arrays[i]);
      var ids = ["ad_ios_id", "app_ad_ios_id", "reserve_ad_ios_id", "reserve_app_ad_ios_id", "ad_db_app_id", "ad_db_slot_id"];
      for (var i = 0; i < ids.length; i++) {
        var value = config[ids[i]];
        if (typeof value === "number") set(config, ids[i], 0);
        else if (typeof value === "string") set(config, ids[i], "");
      }
      for (var key in config) {
        if (typeof config[key] === "string" && (key === "ad_type" || key === "spare_ad_type" || /^uve_ad_scene(?:_|$)/.test(key))) set(config, key, "");
      }
      if (typeof config.close_cyt === "number") set(config, "close_cyt", 1);
    } else if (route === "preload" && Array.isArray(data.ads)) {
      if (own(data, "code") && Number(data.code) !== 200) return $done({});
      for (var i = 0; i < data.ads.length; i++) {
        var item = data.ads[i];
        if (!obj(item)) continue;
        set(item, "daily_display_cnt", 0); set(item, "total_display_cnt", 0); set(item, "display_duration", 0);
        // 保留 ID 以覆盖旧缓存，禁用投放时间和展示次数。
        set(item, "start_time", 2114380800); set(item, "end_time", 2114467199);
        if (!Array.isArray(item.creatives)) continue;
        for (var j = 0; j < item.creatives.length; j++) {
          var creative = item.creatives[j];
          if (obj(creative)) { set(creative, "start_time", 2114380800); set(creative, "end_time", 2114467199); }
        }
      }
    } else if (route === "sdk" || route === "splash") {
      clear(data, "ads"); clear(data.data, "ads");
      clear(data.cached_ad, "ads"); clear(data.data && data.data.cached_ad, "ads");
      if (route === "sdk" && data.show_push_splash_ad === true) set(data, "show_push_splash_ad", false);
    } else if (route === "open_app") clear(data.data, "detail_banner_ad");
    $done(changed ? {body: prefix + JSON.stringify(data) + suffix} : {});
  } catch (_) { $done({}); }
})();
