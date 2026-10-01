/**
 * ECharts 的 tooltip 是常驻 DOM，隐藏时只是 `visibility:hidden`、坐标不重置。
 * 之前统一 `appendTo: 'body'`，隐藏后这条记录仍然按文档坐标参与滚动高度计算，
 * 页面（尤其是内容很短的后台面板）就会被撑出一大段能一直上滑的空白。
 *
 * 统一挂到这个 fixed 图层里：坐标按视口算，且 fixed 元素不参与文档滚动高度。
 */
let layer: HTMLDivElement | null = null;

export const getTooltipLayer = (): HTMLDivElement => {
  if (layer && layer.isConnected) return layer;

  layer = document.createElement('div');
  layer.className = 'echarts-tooltip-layer';
  document.body.appendChild(layer);

  return layer;
};
