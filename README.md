# Travel Flow（旅游规划网页）

一个偏苹果官网风格的单页旅游路线规划 App。

## 功能

- 新建 / 编辑 / 删除路线
- 路线列表管理（本地存储）
- 途经点增删改 + 拖拽排序
- 每个途经点支持：备注、计划事项、停留时长、图片上传、所属天数
- 攻略文本一键解析（支持本地规则，亦支持 OpenAI 兼容接口）并自动填入行程
- Google Maps 地图展示（Marker + 路径，新增途经点后可直接展示）
- 同一天点位与路线同色，不同天自动区分颜色
- 使用 Google Directions API 计算总距离 / 总耗时 + 每日路上耗时
- 支持多路线方案选择（可切换备选路线）
- 支持出行方式：驾车、步行、公共交通、骑行
- 导出当前路线 JSON

## 使用

1. 直接用浏览器打开 `index.html`（或用任意静态服务器）。
2. 在右侧地图面板填入你的 Google Maps API Key。
3. 点击「加载地图」。

> API Key 只保存在浏览器 localStorage，不会上传到服务器。

## Google API 建议开启

- Maps JavaScript API
- Directions API
- Places API（预留）

## 数据存储

当前版本为纯前端 Demo，数据存在浏览器 localStorage（键：`travel-flow-routes-v1`）。
后续可接入后端（Supabase/Firebase/Node + DB）实现多端同步与账号体系。
