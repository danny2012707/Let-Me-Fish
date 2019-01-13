# Let-Me-Fish

原作者: https://github.com/Lambda11/let-me-fish

<img src=http://u.cubeupload.com/Owyn/lemmefish.jpg>

------------------------

1.复制文件夹 defs 中的全部文档 覆盖到

tera-proxy\node_modules\tera-data\protocol\

------------------------

2.编辑: tera-proxy\node_modules\tera-data\map\protocol.343318.map

台服(TW)请自行追加 5个映射码:

------------------------

C_END_FISHING_MINIGAME = 21626

C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT = 58457

C_START_FISHING_MINIGAME = 31890



S_FISHING_BITE = 60088

S_START_FISHING_MINIGAME = 57542

------------------------

3.进入游戏钓鱼区域

- /8频道 键入命令 fish 打开模组

- 制作面板, 点击制作一种[鱼饵], 如果之前有配置[鱼饵配方]或[保存]过钓鱼配置, 次步骤可跳过

- 激活背包[鱼饵]BUFF

- 丢出鱼竿

- 常用: fish 状态

- 常用: fish 保存

- 常用: fish 读取

------------------------

[仿真人] 自动钓鱼/合成鱼饵/分解鱼肉/延迟拉钩

/8频道 键入命令 | 效果说明
--- | ---
fish | 开启/关闭模组 (默认关闭)
fish 分解 | 自动分解[一般鱼类] (默认开启)
fish 大物 | 自动分解[大物鱼类] (默认关闭)
fish 状态 | 查询钓鱼模组各功能 开关状态
fish 重置 | 各项配置重置默认值
fish 保存 | 保存当前的各项配置 (save文件夹中)
fish 读取 | 读取保存的各项配置
