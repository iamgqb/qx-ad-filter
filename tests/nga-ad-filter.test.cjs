// @author yuecheng
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resource = fs.readFileSync(path.join(__dirname, "../rewrites/nga-ad-filter.conf"), "utf8");
const active = resource.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
const rules = active.filter(line => line.includes(" url "));
const patterns = rules.map(line => new RegExp(line.split(" url ")[0]));
const matches = url => patterns.filter(pattern => pattern.test(url)).length;
const hosts = new Set(active.find(line => line.startsWith("hostname = ")).split("=")[1].split(",").map(s => s.trim()));

const observed = [
  "https://g1.tagtic.cn/v3/ad/aggregation",
  "https://mi.gdt.qq.com/gdt_mview.fcg",
  "https://v2mi.gdt.qq.com/gdt_mview.fcg",
  "https://api-access.pangolin-sdk-toutiao.com/api/ad/union/sdk/get_ads/",
  "https://api-access.pangolin-sdk-toutiao1.com/api/ad/union/sdk/get_ads/",
  "https://api-access.pangolin-sdk-toutiao.com/api/ad/union/mediation/exchange/",
  "https://open.e.kuaishou.com/rest/e/v3/open/univ",
  "https://adservice.sigmob.cn/ad/v4"
];

test("NGA 原生资源仅包含 hostname 与原生拒绝规则，无脚本或诊断代码", () => {
  assert.equal(active.length, rules.length + 1);
  assert.equal(rules.length, 5);
  for (const rule of rules) assert(rule.endsWith(" url reject-dict"));
  assert(!active.some(line => line.startsWith("[")));
  assert(!/script-|\$prefs|\$iCloud|console\.|nga-.*observe/.test(resource));
});

test("实际 SDK 路径只匹配一次，查询参数顺序不影响匹配，MitM 覆盖目标域名", () => {
  for (const url of observed) {
    assert(hosts.has(new URL(url).hostname), url);
    for (const query of ["", "?appId=fixture&sdkVersion=1", "?sdkVersion=1&appId=fixture"]) {
      assert.equal(matches(url + query), 1, url + query);
    }
  }
});

test("保留普通 NGA 内容、图片、SDK 配置和非投放请求", () => {
  const normal = [
    "https://ngabbs.com/app_api.php?__lib=user&__act=detail",
    "https://ngabbs.com/nuke.php?__lib=app_inter&__act=recmd_topic",
    "https://ngabbs.com/read.php?tid=123",
    "https://img.nga.178.com/attachments/fixture.jpg",
    "https://img4.nga.cn/ngabbs/nga_classic/f/app/7.png",
    "https://mi.gdt.qq.com/",
    "https://sdk.e.qq.com/event",
    "https://g1.tagtic.cn/v2/strategy/openscreen",
    "https://g1.tagtic.cn/v2/strategy/isrequest",
    "https://adservice.sigmob.cn/extconfig?appId=fixture",
    "https://api-access.pangolin-sdk-toutiao.com/api/ad/union/mediation/config/",
    "https://api-access.pangolin-sdk-toutiao1.com/api/ad/union/sdk/stats/batch/",
    "https://open.e.kuaishou.com/rest/e/v3/open/other",
    "https://adprolink.xwpbj.com/mediation/sdk/getPlacementMappingIos"
  ];
  for (const url of normal) assert.equal(matches(url), 0, url);
});

test("域名、协议、路径和扩展名边界不误匹配", () => {
  for (const url of observed) {
    const parsed = new URL(url);
    const neighbors = [
      url.replace("https:", "http:"),
      url.replace(parsed.hostname, parsed.hostname + ".example.com"),
      url.replace(parsed.hostname, "unrelated.example.com"),
      url.replace(parsed.pathname, "/unrelated" + parsed.pathname),
      url + "extra",
      url + "/extra"
    ];
    for (const neighbor of neighbors) assert.equal(matches(neighbor), 0, neighbor);
  }
});
