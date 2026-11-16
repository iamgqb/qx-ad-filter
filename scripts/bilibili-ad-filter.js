/**
 * 哔哩哔哩 iOS：首页商业卡片与开屏预加载过滤。
 * @author iamgqb
 */
(function () {
  "use strict";

  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function filter() {
    var match = /^https:\/\/app\.bilibili\.com\/x\/v2\/(feed\/index|splash\/list)(?:\?[^#]*)?$/.exec($request.url || "");
    if (!match || $request.method !== "GET" || $response.statusCode !== 200 || typeof $response.body !== "string") return {};

    var headers = $response.headers || {};
    for (var name in headers) {
      if (name.toLowerCase() === "content-type" && !/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(headers[name])) return {};
    }

    var body = JSON.parse($response.body);
    if (!object(body) || body.code !== 0 || !object(body.data)) return {};
    var data = body.data, changed = false;

    if (match[1] === "feed/index") {
      if (!Array.isArray(data.items)) return {};
      var items = data.items.filter(function (item) {
        return !(object(item) && item.card_type === "cm_v2" &&
          (item.card_goto === "ad_web_s" || item.card_goto === "ad_av") &&
          object(item.ad_info) && object(item.ad_info.creative_content));
      });
      if (items.length !== data.items.length) {
        data.items = items;
        changed = true;
      }
    } else {
      // 非空 keep_ids 的缓存语义尚未验证，未知结构原样放行。
      if (!Array.isArray(data.list) || !Array.isArray(data.show) || !Array.isArray(data.keep_ids) || data.keep_ids.length) return {};
      var expired = Object.create(null);
      data.list.forEach(function (item) {
        if (!object(item) || item.is_ad !== true ||
          (typeof item.id !== "string" && typeof item.id !== "number") ||
          typeof item.begin_time !== "number" || typeof item.end_time !== "number" || typeof item.duration !== "number") return;
        expired[String(item.id)] = true;
        // 保留 ID 覆盖旧缓存；空列表不能使客户端已有素材失效。
        if (item.begin_time !== 1 || item.end_time !== 2 || item.duration !== 0) {
          item.begin_time = 1;
          item.end_time = 2;
          item.duration = 0;
          changed = true;
        }
      });
      data.show.forEach(function (item) {
        if (!object(item) || (typeof item.id !== "string" && typeof item.id !== "number") ||
          expired[String(item.id)] !== true || typeof item.stime !== "number" || typeof item.etime !== "number") return;
        if (item.stime !== 1 || item.etime !== 2) {
          item.stime = 1;
          item.etime = 2;
          changed = true;
        }
      });
    }

    return changed ? { body: JSON.stringify(body) } : {};
  }

  var result;
  try { result = filter(); } catch (_) { result = {}; }
  $done(result);
})();
