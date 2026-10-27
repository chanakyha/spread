import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Flex, Segmented, Spin, Tag, Typography } from 'antd';

// Each route loads only its own grid library.
const ReactSpreadsheetSheet = lazy(() => import('./components/ReactSpreadsheetSheet'));
const AgGridSheet = lazy(() => import('./components/AgGridSheet'));

const DEMOS = [
  { path: '/', label: 'react-spreadsheet', Component: ReactSpreadsheetSheet },
  { path: '/ag-grid', label: 'AG Grid', Component: AgGridSheet },
];

const theme = {
  token: {
    colorPrimary: '#111827',
    colorLink: '#4f46e5',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: 8,
  },
};

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const demo = DEMOS.find((d) => d.path === pathname) ?? DEMOS[0];

  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <main className="page">
          <Flex className="page-head" justify="space-between" align="flex-end" gap={16} wrap>
            <div>
              <Typography.Title level={1}>Sales</Typography.Title>
              <Typography.Paragraph type="secondary">
                Built with <strong>{demo.label}</strong> and Ant Design. Expand a category, double-click a cell to edit, change a status,
                or use the row actions.
              </Typography.Paragraph>
            </div>
            <Flex align="center" gap={8}>
              <Segmented
                value={demo.path}
                onChange={(path) => navigate(path)}
                options={DEMOS.map((d) => ({ value: d.path, label: d.label }))}
              />
              <Tag color="green" variant="filled">MIT</Tag>
            </Flex>
          </Flex>

          <Suspense fallback={<Flex justify="center" className="page-loading"><Spin /></Flex>}>
            <Routes>
              {DEMOS.map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </AntApp>
    </ConfigProvider>
  );
}
