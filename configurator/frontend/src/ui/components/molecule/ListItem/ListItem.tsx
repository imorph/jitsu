// @Libs
import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import cn from 'classnames';
// @Styles
import styles from './ListItem.module.less';
// @Icons
import DeleteOutlined from '@ant-design/icons/lib/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/lib/icons/EditOutlined';

export interface SomeAction {
  key: 'edit' | 'delete';
  method: (id: string) => () => void;
  title: string;
}

export interface Props {
  className?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  additional?: React.ReactNode;
  prefix?: React.ReactNode;
  actions?: SomeAction[];
  id: string;
}

// ToDo: maybe components name has to be changed?
const ListItemComponent = ({ className, icon, title, description, additional, prefix, actions, id }: Props) => {
  const iconsMap = {
    edit: <EditOutlined/>,
    delete: <DeleteOutlined/>
  };

  return (
    <li className={cn(styles.item, className)}>
      <span className={styles.left}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.info}>
          <span className={styles.title}>{title}</span>
          {description && <span className={styles.description}>{description}</span>}
          {additional && <span className={styles.additional}>{additional}</span>}
        </span>
      </span>
      {
        actions?.length > 0 && <span className={styles.right}>
          {
            actions.map((action: SomeAction, index: number) => {
              return (
                <span key={action.key} className={styles.action}>
                  <Button icon={iconsMap[action.key]} key="edit" shape="round" onClick={action.method(id)}>{action.title}</Button>
                  {
                    index < actions.length - 1 && <span className={styles.splitter} />
                  }
                </span>
              )
            })
          }
        </span>
      }
    </li>
  );
};

ListItemComponent.displayName = 'ListItem';

export const ListItem = memo(ListItemComponent);
