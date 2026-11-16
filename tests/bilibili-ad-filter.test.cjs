// @author iamgqb
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runRewrite, runFixture } = require("../skills/qx-ad-filter/scripts/run-rewrite.cjs");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/bilibili-ad-filter.js"), "utf8");
const resource = fs.readFileSync(path.join(root, "rewrites/bilibili-ad-filter.conf"), "utf8");
const fixtures = require("./fixtures/bilibili-basic.json");
const feed = "https://app.bilibili.com/x/v2/feed/index";
const splash = "https://app.bilibili.com/x/v2/splash/list";
const normal = { card_type: "small_cover_v2", card_goto: "av", title: "讨论广告的视频", idx: 11, ad_info: { is_ad_loc: true, resource: 100, source: 200 } };
const ad = { card_type: "cm_v2", card_goto: "ad_web_s", ad_info: { creative_content: { title: "示例商品" }, is_ad_loc: true } };

function run(body, url = feed, extra = {}) {
  const output = runRewrite(source, { body, url, ...extra });
  assert.equal(output.jsonStringifyCalls, Object.hasOwn(output.result, "body") ? 1 : 0);
  return output.result;
}

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const output = runFixture(source, fixture);
    assert.equal(output.jsonStringifyCalls, Object.hasOwn(output.result, "body") ? 1 : 0);
  });
}

test("首页保留普通视频的 ad_info、直播、未知卡片及混合值，不重排 idx", () => {
  const keep = [normal, null, 1, false, { card_type: "small_cover_v9", card_goto: "live" },
    { ...ad, card_type: "unknown" }, { ...ad, card_goto: "unknown" },
    { ...ad, ad_info: null }, { ...ad, ad_info: { creative_content: [] } }];
  const body = { code: 0, data: { items: [ad, ...keep, { ...ad, card_goto: "ad_av" }], config: { next: "fixture-next" } } };
  const result = JSON.parse(run(body).body);
  assert.deepEqual(result, { ...body, data: { ...body.data, items: keep } });
  assert.deepEqual(run({ code: 0, data: { items: keep } }), {});
});

test("开屏仅使明确广告和同 ID 展示计划过期，保留 ID、素材、非广告、间隔与外壳", () => {
  const body = { code: 0, message: "0", ttl: 1, data: {
    max_time: 30, min_interval: 3600, pull_interval: 900, keep_ids: [],
    list: [{ id: 101, is_ad: true, begin_time: 100, end_time: 200, duration: 3, thumb: "https://assets.example.com/splash.jpg" }, { id: "102", is_ad: false }, { id: 103, is_ad: 1 }, null],
    show: [{ id: "101", stime: 100, etime: 200 }, { id: 102 }, { id: "unrecognized" }, null],
    splash_request_id: "fixture-request"
  } };
  const result = JSON.parse(run(body, splash).body);
  assert.deepEqual(result, { ...body, data: { ...body.data,
    list: [{ ...body.data.list[0], begin_time: 1, end_time: 2, duration: 0 }, ...body.data.list.slice(1)],
    show: [{ ...body.data.show[0], stime: 1, etime: 2 }, ...body.data.show.slice(1)]
  } });
  assert.deepEqual(run(result, splash), {});
});

test("正常、空响应、错误、未知容器与非空缓存保留列表原样放行", () => {
  for (const body of [null, [], {}, { code: -1, data: { items: [ad] } },
    { code: "0", data: { items: [ad] } }, { code: 0, data: [] },
    { code: 0, data: { items: {} } }, { code: 0, data: { items: [normal] } },
    "", "<html>error</html>", "callback({\"code\":0})", "{bad json"]) {
    assert.deepEqual(run(body), {});
  }
  for (const data of [ {}, { list: [], show: [], keep_ids: [] },
    { list: [{ id: 1, is_ad: false }], show: [{ id: 1 }], keep_ids: [] },
    { list: [{ id: 1, is_ad: true }], show: [], keep_ids: [1] },
    { list: [{ id: 1, is_ad: true }], show: {}, keep_ids: [] },
    { list: [{ id: 1, is_ad: true }], show: [] } ]) {
    assert.deepEqual(run({ code: 0, data }, splash), {});
  }
});

test("未知展示记录的缺失 ID 和对象 ID 不与字符串 ID 混淆", () => {
  const show = [{ stime: 100 }, { id: { value: 1 } }, { id: "ordinary" }];
  const result = JSON.parse(run({ code: 0, data: {
    list: [{ id: "undefined", is_ad: true, begin_time: 100, end_time: 200, duration: 3 }, { id: "[object Object]", is_ad: true, begin_time: 100, end_time: 200, duration: 3 }],
    show, keep_ids: []
  } }, splash).body);
  assert.deepEqual(result.data.show, show);
});

test("只处理目标 GET、HTTP 200 与 JSON 类型", () => {
  const body = { code: 0, data: { items: [ad] } };
  for (const method of ["POST", "HEAD", "OPTIONS"]) assert.deepEqual(run(body, feed, { method }), {});
  for (const statusCode of [201, 204, 301, 403, 500]) assert.deepEqual(run(body, feed, { statusCode }), {});
  for (const type of ["text/html", "application/octet-stream", "text/plain"]) {
    assert.deepEqual(run(body, feed, { responseHeaders: { "Content-Type": type } }), {});
  }
  for (const type of ["application/json", "application/json; charset=utf-8", "application/problem+json"]) {
    assert.equal(JSON.parse(run(body, feed, { responseHeaders: { "content-TYPE": type } }).body).data.items.length, 0);
  }
});

const active = resource.split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"));
const rules = active.filter(s => / url(?:-and-header)? /.test(s));
const patterns = rules.map(s => ({ url: new RegExp(s.split(" ")[0]), headers: s.includes(" url-and-header ") ? new RegExp(s.split(" ")[1]) : null }));
const matches = (url, method = "GET") => patterns.filter(p => p.url.test(url) && (!p.headers || p.headers.test(method + " / HTTP/1.1\r\n"))).length;

test("原生订阅只有必要域名、两条远程脚本规则与一条展示拒绝", () => {
  assert.equal(active.length, 4);
  assert.equal(active[0], "hostname = app.bilibili.com");
  assert.equal(rules.length, 3);
  assert.equal(rules.filter(s => s.endsWith(" url-and-header reject-dict")).length, 1);
  const url = "https://raw.githubusercontent.com/iamgqb/qx-ad-filter/main/scripts/bilibili-ad-filter.js";
  assert.equal(rules.filter(s => s.endsWith(" url script-response-body " + url)).length, 2);
  assert(fs.existsSync(path.join(root, new URL(url).pathname.split("/main/")[1])));
  assert(!/\[(?:rewrite_local|mitm)\]|script-echo|observe/.test(resource));
  assert(!/\$prefs|\$iCloud|\$task|\$notify|console\.|setTimeout|setInterval|fetch\(/.test(source));
});

test("原生开屏展示规则仅拒绝实测 GET，保留其他方法", () => {
  const url = "https://app.bilibili.com/x/v2/splash/show?fixture=1";
  assert.equal(matches(url, "GET"), 1);
  for (const method of ["POST", "HEAD", "OPTIONS", "PUT", "GETTING", "get"]) assert.equal(matches(url, method), 0, method);
});

test("目标查询参数顺序唯一匹配，域名、路径、协议与相邻业务不误匹配", () => {
  const targets = [feed, splash, "https://app.bilibili.com/x/v2/splash/show"];
  for (const url of targets) {
    assert.equal(new URL(url).hostname, "app.bilibili.com");
    for (const query of ["", "?build=fixture&platform=ios", "?platform=ios&build=fixture"]) assert.equal(matches(url + query), 1);
    for (const other of [url.replace("https:", "http:"), url.replace("app.bilibili.com", "api.bilibili.com"),
      url.replace("app.bilibili.com", "app.bilibili.com.example.com"), url.replace("/x/", "/other/x/"),
      url + "extra", url + "/extra", url + ".json", "https://app.bilibili.com/normal?url=" + new URL(url).pathname]) {
      assert.equal(matches(other), 0, other);
      assert.deepEqual(run({ code: 0, data: { items: [ad] } }, other), {}, other);
    }
  }
  for (const url of ["https://app.bilibili.com/x/v2/splash/brand/list", "https://app.bilibili.com/x/v2/splash/event/list2",
    "https://app.bilibili.com/x/resource/show/tab/v2", "https://api.bilibili.com/x/v2/reply/main",
    "https://app.bilibili.com/x/v2/view", "https://grpc.biliapi.net/bilibili.app.view.v1.View/View",
    "https://cm.bilibili.com/cm/api/fees/wise", "https://i0.hdslb.com/fixture.jpg"]) {
    assert.equal(matches(url), 0, url);
    assert.deepEqual(run({ code: 0, data: { items: [ad] } }, url), {}, url);
  }
});
