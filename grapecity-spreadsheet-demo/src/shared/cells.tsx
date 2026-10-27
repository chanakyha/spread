/**
 * Ant Design components rendered inside grid cells by both routes:
 * tree node labels, the status picker, row actions, and the product drawer.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Button, Descriptions, Drawer, Flex, Popconfirm, Progress, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, CopyOutlined, DeleteOutlined, ExclamationCircleFilled, EyeOutlined, PlusOutlined, RightOutlined,
} from '@ant-design/icons';
import { CATEGORY_COLOR, STATUSES, int, money, type Category, type Product, type Status, type TreeNode } from './salesData';

/** Keeps clicks inside a cell component from starting grid selection/editing. */
const stop = (e: MouseEvent) => e.stopPropagation();

export function CategoryDot({ category }: { category: Category }) {
  return <span className="tree-dot" style={{ background: CATEGORY_COLOR[category] }} aria-hidden />;
}

/** The tree column: expandable category nodes and indented product leaves. */
export function TreeLabel(props: { kind: 'category'; name: Category; count: number; expanded: boolean; onToggle: () => void } | { kind: 'product'; name: string }) {
  if (props.kind === 'product') {
    return (
      <span className="tree-label tree-label--leaf">
        <span className="tree-guide" aria-hidden />
        <span className="tree-text">{props.name}</span>
      </span>
    );
  }
  return (
    <span className="tree-label">
      <Button
        type="text"
        size="small"
        className={`tree-toggle${props.expanded ? ' is-open' : ''}`}
        icon={<RightOutlined />}
        onMouseDown={stop}
        onClick={(e) => (stop(e), props.onToggle())}
        aria-label={props.expanded ? `Collapse ${props.name}` : `Expand ${props.name}`}
        aria-expanded={props.expanded}
      />
      <CategoryDot category={props.name} />
      <strong className="tree-text">{props.name}</strong>
      <span className="tree-count">{props.count}</span>
    </span>
  );
}

const STATUS_TAG: Record<Status, { color: string; icon: ReactNode }> = {
  'In stock': { color: 'success', icon: <CheckCircleFilled /> },
  'Low stock': { color: 'warning', icon: <ExclamationCircleFilled /> },
  'Out of stock': { color: 'error', icon: <CloseCircleFilled /> },
};

/** Status colors always carry an icon and a label, never color alone. */
export function StatusTag({ status }: { status: Status }) {
  return (
    <Tag color={STATUS_TAG[status].color} icon={STATUS_TAG[status].icon} variant="filled" className="status-tag">
      {status}
    </Tag>
  );
}

export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <span onMouseDown={stop} onDoubleClick={stop} onKeyDown={(e) => e.stopPropagation()} className="cell-control">
      <Select<Status>
        size="small"
        variant="borderless"
        value={value}
        onChange={onChange}
        popupMatchSelectWidth={false}
        options={STATUSES.map((s) => ({ value: s, label: <StatusTag status={s} /> }))}
        aria-label="Status"
        className="status-select"
      />
    </span>
  );
}

/** Category rows summarize the statuses of their children. */
export function StatusSummary({ counts }: { counts: Record<Status, number> }) {
  const flagged = (['Low stock', 'Out of stock'] as const).filter((s) => counts[s]);
  if (!flagged.length) return <Typography.Text type="secondary">All in stock</Typography.Text>;
  return (
    <Space size={4}>
      {flagged.map((s) => (
        <Tag key={s} color={STATUS_TAG[s].color} icon={STATUS_TAG[s].icon} variant="filled" className="status-tag">
          {counts[s]} {s === 'Low stock' ? 'low' : 'out'}
        </Tag>
      ))}
    </Space>
  );
}

export function ProductActions({ onView, onDuplicate, onDelete }: { onView: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <Space size={2} onMouseDown={stop} onDoubleClick={stop} className="cell-control">
      <Tooltip title="View details">
        <Button size="small" type="text" icon={<EyeOutlined />} onClick={onView} aria-label="View details" />
      </Tooltip>
      <Tooltip title="Duplicate">
        <Button size="small" type="text" icon={<CopyOutlined />} onClick={onDuplicate} aria-label="Duplicate" />
      </Tooltip>
      <Popconfirm title="Delete this product?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={onDelete}>
        <Tooltip title="Delete">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Delete" />
        </Tooltip>
      </Popconfirm>
    </Space>
  );
}

export function CategoryActions({ onAdd }: { onAdd: () => void }) {
  return (
    <span onMouseDown={stop} onDoubleClick={stop} className="cell-control">
      <Button size="small" icon={<PlusOutlined />} onClick={onAdd}>
        Add
      </Button>
    </span>
  );
}

export function ProductDrawer({
  product, tree, onClose, onDuplicate, onDelete,
}: { product: Product | null; tree: TreeNode[]; onClose: () => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const node = product && tree.find((n) => n.category === product.category);
  const total = product ? product.units * product.price : 0;
  const allRevenue = tree.reduce((s, n) => s + n.total, 0);
  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      title={product?.name}
      size={420}
      extra={
        product && (
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => onDuplicate(product.id)}>Duplicate</Button>
            <Popconfirm title="Delete this product?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => (onDelete(product.id), onClose())}>
              <Button danger icon={<DeleteOutlined />}>Delete</Button>
            </Popconfirm>
          </Space>
        )
      }
    >
      {product && (
        <Flex vertical gap={24}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Category">
              <Space size={6}><CategoryDot category={product.category} />{product.category}</Space>
            </Descriptions.Item>
            <Descriptions.Item label="Units">{int(product.units)}</Descriptions.Item>
            <Descriptions.Item label="Price">{money(product.price)}</Descriptions.Item>
            <Descriptions.Item label="Total">{money(total)}</Descriptions.Item>
            <Descriptions.Item label="Status"><StatusTag status={product.status} /></Descriptions.Item>
          </Descriptions>
          <div>
            <Typography.Text type="secondary">Share of {product.category} revenue</Typography.Text>
            <Progress percent={node?.total ? Math.round((total / node.total) * 1000) / 10 : 0} strokeColor={CATEGORY_COLOR[product.category]} />
            <Typography.Text type="secondary">Share of all revenue</Typography.Text>
            <Progress percent={allRevenue ? Math.round((total / allRevenue) * 1000) / 10 : 0} strokeColor="#2a78d6" />
          </div>
        </Flex>
      )}
    </Drawer>
  );
}
