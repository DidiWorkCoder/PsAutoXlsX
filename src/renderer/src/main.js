import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import './styles/index.css';
import App from './App.vue';
import BatchRunner from './components/BatchRunner.vue';

// 同一个包两种用法：
//   双击时同目录有 config.json  → 静默跑批（不显示界面）
//   否则                        → 正常打开配置界面
const isBatch = new URLSearchParams(location.search).get('mode') === 'batch';

createApp(isBatch ? BatchRunner : App).use(Antd).mount('#app');
