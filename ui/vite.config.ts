import { defineConfig, loadEnv } from 'vite';
import reactRefresh from '@vitejs/plugin-react-refresh';

export default ({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd()));
  return defineConfig({
    server: {
      port: 3000,
    },
    plugins: [reactRefresh()],
  });
};
