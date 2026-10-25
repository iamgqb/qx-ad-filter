// @author yuecheng
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runRewrite, runFixture } = require("../skills/qx-ad-filter/scripts/run-rewrite.cjs");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/weibo-ad-filter.js"), "utf8");
const fixtures = require("./fixtures/weibo-basic.json");
const feedUrl = "https://api.weibo.cn/2/statuses/friends/timeline";
const adUrl = "https://api.weibo.cn/2/ad/weibointl";
const preloadUrl = "https://bootpreload.uve.weibo.com/v1/ad/preload?fixture=1";

function run(body, url = feedUrl, statusCode = 200) {
  const output = runRewrite(source, { body, url, statusCode });
  assert.equal(output.jsonStringifyCalls, Object.hasOwn(output.result, "body") ? 1 : 0);
  return output.result;
}
function parsed(body, url) { return JSON.parse(run(body, url).body); }

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const output = runFixture(source, fixture);
    assert.equal(output.jsonStringifyCalls, Object.hasOwn(output.result, "body") ? 1 : 0);
  });
}

test("25 条正常微博完全放行且不编码 JSON", () => {
  const body = { statuses: Array.from({ length: 25 }, (_, id) => ({ id, mblogtype: 0, ad_marked: false, text: "正常微博" })), advertises: [], ad: [], ad_version_2_weibo: [], since_id: "fixture-since", max_id: "fixture-max", next_cursor: "fixture-next", total_number: 25 };
  assert.deepEqual(run(body), {});
});

test("明确广告标记与正常转发、mblogtype、正文相互区分", () => {
  const body = { statuses: [{ id: 1, mblogtype: 1, text: "广告相关讨论" }, { id: 2, promotion: { type: "ad" } }, { id: 3, mblogtypename: "广告" }, { id: 4, is_ad: 1 }, { id: 5, is_ad: 0 }, { id: 6, mblogtypename: "推荐" }, { id: 7, retweeted_status: { promotion: { type: "ad" } } }], max_id: "fixture-max", since_id: "fixture-since", total_number: 99 };
  const result = parsed(body);
  assert.deepEqual(result.statuses.map(o => o.id), [1, 5, 6, 7]);
  for (const key of ["max_id", "since_id", "total_number"]) assert.equal(result[key], body[key]);
});

test("嵌套广告卡片和空广告分组被清理", () => {
  const body = { items: [{ category: "feed", data: { id: 1, mblogtypename: "荐读" } }, { category: "feed", data: { id: 2, text: "普通" } }, { category: "group", items: [{ category: "feed", data: { is_ad: true } }] }] };
  assert.deepEqual(parsed(body).items, [{ category: "feed", data: { id: 2, text: "普通" } }]);
  assert.deepEqual(parsed({ cards: [{ card_type: 11, card_group: [{ mblog: { is_ads: "1" } }] }, { card_type: 9, mblog: { id: 3 } }] }).cards, [{ card_type: 9, mblog: { id: 3 } }]);
});

test("原地清理保留混合类型与相邻正常条目的顺序", () => {
  const result = parsed({ statuses: [null, 1, { id: 1, is_ad: 1 }, { id: 2 }, { id: 3, is_ad: 1 }, { id: 4, mblogtypename: "广告\n" }, { id: 5 }, false], next_cursor: "fixture-next" });
  assert.deepEqual(result.statuses, [null, 1, { id: 2 }, { id: 4, mblogtypename: "广告\n" }, { id: 5 }, false]);
  assert.equal(result.next_cursor, "fixture-next");
});

test("国际版广告位清理且白名单、间隔与其他平台配置保留", () => {
  const body = { retcode: 0, info: "fixture-success", data: { display_ad: 1, ad_list: [], gdt_video_ad_ios: [{ appId: "fixture-a" }, { appId: "fixture-b" }], gdt_video_ad_android: { keep: "android" }, pic_ad: [{ position: 1 }], ad_ios_id: 123, app_ad_ios_id: 456, reserve_ad_ios_id: "fixture-reserve", reserve_app_ad_ios_id: "fixture-app-reserve", ad_db_app_id: null, ad_db_slot_id: null, ad_type: "gdt", spare_ad_type: "uve", wax_days: [1, 2], cyt_days: [1, 2], close_cyt: 0, uve_ad_scene: "fixture-sdk", uve_ad_scene_insert_normal: "fixture-feed", ad_cd_interval: 1200, ad_duration: 86400, scheme_white_list: ["fixture-scheme"] } };
  const result = parsed(body, "https://weibointl.api.weibo.cn/portal.php?c=ad&a=get_coopen_ads");
  const config = result.data;
  for (const key of ["display_ad", "ad_cd_interval", "ad_duration", "scheme_white_list", "gdt_video_ad_android", "ad_db_app_id"]) assert.deepEqual(config[key], body.data[key]);
  for (const key of ["ad_list", "gdt_video_ad_ios", "pic_ad", "wax_days", "cyt_days"]) assert.deepEqual(config[key], []);
  assert.equal(config.ad_ios_id, 0); assert.equal(config.app_ad_ios_id, 0);
  assert.equal(config.reserve_ad_ios_id, ""); assert.equal(config.reserve_app_ad_ios_id, "");
  assert.equal(config.ad_type, ""); assert.equal(config.spare_ad_type, "");
  assert.equal(config.uve_ad_scene, ""); assert.equal(config.uve_ad_scene_insert_normal, "");
  assert.equal(config.close_cyt, 1); assert.equal(result.retcode, 0);
});

function preload() {
  return { code: 200, background_interval: 5, last_ad_show_interval: 1800, realtime_api_timeout: 1000, ads: Array.from({ length: 14 }, (_, i) => ({ adid: "fixture-ad-" + i, total_display_cnt: 5, daily_display_cnt: 3, display_duration: 5, start_time: 1792857600, end_time: 1792943999, creatives: [{ creative_id: "fixture-creative-" + i, start_time: 1792857600, end_time: 1792943999, res_url: "https://assets.example/fixture-" + i }] })) };
}
test("14 条预加载记录失效且 ID、素材和服务端间隔保留", () => {
  const body = preload(), result = parsed(body, preloadUrl);
  for (const key of ["code", "background_interval", "last_ad_show_interval", "realtime_api_timeout"]) assert.equal(result[key], body[key]);
  assert.equal(result.ads.length, 14);
  result.ads.forEach((item, i) => {
    assert.equal(item.adid, body.ads[i].adid);
    for (const key of ["daily_display_cnt", "total_display_cnt", "display_duration"]) assert.equal(item[key], 0);
    assert(item.start_time > 1792943999 && item.end_time > item.start_time && item.end_time < 2147483647);
    assert.equal(item.creatives[0].creative_id, body.ads[i].creatives[0].creative_id);
    assert.equal(item.creatives[0].res_url, body.ads[i].creatives[0].res_url);
    assert.equal(item.creatives[0].start_time, item.start_time);
    assert.equal(item.creatives[0].end_time, item.end_time);
  });
});

test("预加载失败、未知容器及空列表原样放行", () => {
  assert.deepEqual(run({ ...preload(), code: 500 }, preloadUrl), {});
  assert.deepEqual(run({ code: 200, ads: "unknown" }, preloadUrl), {});
  assert.deepEqual(run({ code: 200, ads: [] }, preloadUrl), {});
});

test("错误响应与未知结构不被误改写", () => {
  for (const body of [{ statuses: null }, { statuses: "unknown" }, { error_code: 21301, statuses: [{ is_ad: true }] }, { ok: 0, statuses: [{ is_ad: true }] }, [1, 2, 3]]) assert.deepEqual(run(body), {});
  assert.deepEqual(run({ statuses: [{ is_ad: true }] }, feedUrl, 500), {});
  assert.deepEqual(run({ data: { unexpected: "keep" }, errno: 0, error: "" }, adUrl), {});
  assert.deepEqual(run({ data: [], errno: 0, error: "" }, adUrl), {});
  assert.deepEqual(run({ data: { display_ad: 1, unknown: "keep" } }, "https://weibointl.api.weibo.cn/portal.php?a=get_coopen_ads"), {});
});

const resource = fs.readFileSync(path.join(root, "rewrites/weibo-ad-filter.conf"), "utf8");
const lines = resource.split("\n").filter(line => line.includes(" url ") && !line.startsWith("#"));
const patterns = lines.map(line => new RegExp(line.split(" url ")[0]));
test("原生订阅资源包含 hostname 和规则，且覆盖各目标域名", () => {
  const active = resource.split("\n").map(line => line.trim()).filter(line => line && !/^(#|;|\/\/)/.test(line));
  assert(!active.some(line => /^\[/.test(line)), "资源不能包含完整配置段名");
  const hostLines = active.filter(line => /^hostname\s*=/.test(line));
  assert.equal(hostLines.length, 1);
  assert.equal(active.length, lines.length + 1);
  const hosts = new Set(hostLines[0].split("=")[1].split(",").map(host => host.trim()));
  const targets = [
    ...["api.weibo.cn", "api.weibo.com", "mapi.weibo.cn", "mapi.weibo.com"].map(host => `https://${host}/2/ad/weibointl`),
    ...["weibointl.api.weibo.cn", "weibointl.api.weibo.com"].map(host => `https://${host}/portal.php?a=get_coopen_ads`),
    "https://sdkapp.uve.weibo.com/interface/sdk/sdkad.php",
    "https://wbapp.uve.weibo.com/preload/get_ad",
    preloadUrl, "https://bootrealtime.uve.weibo.com/v1/ad/realtime"
  ];
  for (const url of targets) {
    assert(hosts.has(new URL(url).hostname), "目标域名缺少 MitM hostname");
    assert(patterns.some(regex => regex.test(url)), "目标缺少重写规则");
  }
});

test("资源通过完整 HTTPS URL 引用仓库内的远程脚本", () => {
  const scriptLines = lines.filter(line => line.includes(" url script-response-body "));
  assert.equal(scriptLines.length, 6);
  const scriptUrls = new Set();
  for (const line of scriptLines) {
    const url = new URL(line.split(" url script-response-body ")[1]);
    assert.equal(url.protocol, "https:");
    assert.equal(url.host, "raw.githubusercontent.com");
    assert.equal(url.username + url.password + url.search + url.hash, "");
    const parts = url.pathname.split("/").filter(Boolean);
    assert.deepEqual(parts.slice(0, 3), ["iamgqb", "qx-ad-filter", "main"]);
    const localFile = path.resolve(root, ...parts.slice(3));
    assert(localFile.startsWith(root + path.sep));
    assert.equal(fs.readFileSync(localFile, "utf8"), source);
    scriptUrls.add(url.href);
  }
  assert.equal(scriptUrls.size, 1);
});

test("规则覆盖实际端点与参数顺序，且不匹配邻近业务", () => {
  assert.equal(lines.length, 7);
  for (const url of [adUrl, feedUrl, "https://api.weibo.cn/2/statuses/friends_timeline?fixture=1", preloadUrl, "https://weibointl.api.weibo.cn/portal.php?a=get_coopen_ads&c=ad", "https://weibointl.api.weibo.cn/portal.php?c=ad&fixture=1&a=get_coopen_ads&scene=start", "https://weibointl.api.weibo.cn/portal.php?a=open_app", "https://wbapp.uve.weibo.com/preload/get_ad"]) assert(patterns.some(regex => regex.test(url)), url);
  for (const url of ["https://api.weibo.cn/2/direct_messages", "https://api.weibo.cn/2/ad/weibointl_extra", "https://weibointl.api.weibo.cn/portal.php?a=open_application", "https://example.com/2/ad/weibointl"]) assert(!patterns.some(regex => regex.test(url)), url);
});

test("实时开屏使用 QX 原生规则，脚本不含旧探针处理", () => {
  const url = "https://bootrealtime.uve.weibo.com/v3/ad/realtime?fixture=1";
  const line = lines.find(line => line.endsWith(" url reject-dict"));
  assert(new RegExp(line.split(" url ")[0]).test(url));
  assert.deepEqual(run({ code: 200, ads: [{ id: "fixture" }] }, url), {});
});

test("正式脚本没有存储、日志、计时与额外网络接口", () => {
  assert(!/\$iCloud|\$prefs|\$task|\$notify|console\.|TextEncoder|new Date|setTimeout|setInterval/.test(source));
});

test("测试器能识别被脚本捕获的副作用及重复回调", () => {
  const input = { url: "https://example.com", body: {} };
  assert.throws(() => runRewrite('try { $iCloud.writeFile("fixture", "fixture"); } catch (_) {} $done({});', input), /运行时副作用/);
  assert.throws(() => runRewrite("$done({}); $done({});", input), /恰好一次/);
});
