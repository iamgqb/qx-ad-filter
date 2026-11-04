// @author iamgqb
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resource = fs.readFileSync(path.join(__dirname, "../rewrites/zhihu-ad-filter.conf"), "utf8");
const active = resource.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
const rules = active.filter(line => line.includes(" url "));
const patterns = rules.map(line => new RegExp(line.split(" url ")[0]));
const matches = url => patterns.filter(pattern => pattern.test(url)).length;
const hosts = new Set(active.find(line => line.startsWith("hostname = ")).split("=")[1].split(",").map(s => s.trim()));
const observed = [
  "https://api.zhihu.com/commercial_api/launch_v2",
  "https://api.zhihu.com/commercial_api/real_time_launch_v2"
];

test("知乎原生资源仅含必要 hostname 和拒绝规则", () => {
  assert.equal(active.length, rules.length + 1);
  assert.equal(rules.length, 1);
  assert(rules.every(rule => rule.endsWith(" url reject-dict")));
  assert(!/script-|\$prefs|\$iCloud|console\.|observe|\[rewrite_local\]|\[mitm\]/.test(resource));
  assert.deepEqual([...hosts], ["api.zhihu.com"]);
});

test("知乎实测开屏路径和查询参数顺序均唯一匹配，MitM 覆盖完整", () => {
  for (const url of observed) {
    assert(hosts.has(new URL(url).hostname));
    for (const query of ["", "?app=fixture&size=fixture&vf=fixture", "?vf=fixture&size=fixture&app=fixture"]) {
      assert.equal(matches(url + query), 1, url + query);
    }
  }
});

test("保留知乎推荐、关注、热榜、正文、SDK 配置、其他商业路径和素材", () => {
  const normal = [
    "https://api.zhihu.com/topstory/recommend?device=fixture",
    "https://api.zhihu.com/topstory/hot-lists/total?limit=30",
    "https://api.zhihu.com/moments/tab_v2?feed_type=fixture",
    "https://api.zhihu.com/answers/12345",
    "https://api.zhihu.com/commercial_api/sdk/prefetch",
    "https://api.zhihu.com/commercial_api/real_time_pull_refresh_v2",
    "https://api.zhihu.com/commercial_api/app_float_layer",
    "https://appcloud2.zhihu.com/v3/resource?group_name=fixture",
    "https://pic1.zhimg.com/fixture.jpg",
    "https://www.zhihu.com/question/12345/answer/67890"
  ];
  for (const url of normal) assert.equal(matches(url), 0, url);
});

test("知乎开屏规则不匹配相邻路径、其他域名、协议或查询参数中的伪路径", () => {
  for (const url of observed) {
    const pathname = new URL(url).pathname;
    for (const neighbor of [
      url.replace("https:", "http:"),
      url.replace("api.zhihu.com", "api.zhihu.com.example.com"),
      url.replace("api.zhihu.com", "www.zhihu.com"),
      url.replace(pathname, "/unrelated" + pathname),
      url + "extra", url + "/extra", url + ".json",
      "https://api.zhihu.com/normal?redirect=" + pathname
    ]) assert.equal(matches(neighbor), 0, neighbor);
  }
});
