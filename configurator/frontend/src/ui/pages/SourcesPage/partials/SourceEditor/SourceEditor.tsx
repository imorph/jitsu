// @Libs
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePath, Prompt, useHistory, useParams } from 'react-router-dom';
import { Form, message } from 'antd';
import cn from 'classnames';
import { snakeCase } from 'lodash';
// @Page
import { SourceEditorConfig } from './SourceEditorConfig';
import { SourceEditorCollections } from './SourceEditorCollections';
import { SourceEditorDestinations } from './SourceEditorDestinations';
// @Components
import { Tab, TabsConfigurator } from '@molecule/TabsConfigurator';
import { PageHeader } from '@atom/PageHeader';
import { EditorButtons } from '@molecule/EditorButtons';
// @Types
import { CollectionSourceData, CommonSourcePageProps } from '@page/SourcesPage';
import { SourceConnector } from '@catalog/sources/types';
import { FormInstance } from 'antd/es';
import { withHome } from '@molecule/Breadcrumbs/Breadcrumbs.types';
// @Routes
import { sourcesPageRoutes } from '@page/SourcesPage/routes';
// @Catalog sources
import { allSources } from '@catalog/sources/lib';
// @Utils
import { sourcePageUtils } from '@page/SourcesPage/SourcePage.utils';
import { validateTabForm } from '@util/forms/validateTabForm';
import { makeObjectFromFieldsValues } from '@util/forms/marshalling';
// @Hooks
import { useForceUpdate } from '@hooks/useForceUpdate';
// @Services
import ApplicationServices from '@service/ApplicationServices';
import { handleError } from '@./lib/components/components';

const SourceEditor = ({ projectId, sources, updateSources, setBreadcrumbs, editorMode }: CommonSourcePageProps) => {
  const services = ApplicationServices.get();

  const history = useHistory();

  const forceUpdate = useForceUpdate();

  const params = useParams<{ source?: string; sourceId?: string; tabName?: string; }>();

  const [sourceSaving, setSourceSaving] = useState<boolean>(false);
  const [savePopover, switchSavePopover] = useState<boolean>(false);
  const [testConnecting, setTestConnecting] = useState<boolean>(false);
  const [testConnectingPopover, switchTestConnectingPopover] = useState<boolean>(false);

  const connectorSource = useMemo<SourceConnector>(
    () => {
      let sourceType = params.source
        ? params.source
        : params.sourceId
          ? sources.find(src => src.sourceId === params.sourceId)?.sourceProtoType
          : undefined;

      return sourceType
        ? allSources.find((source: SourceConnector) => snakeCase(source.id) === snakeCase(sourceType))
        : {} as SourceConnector;
    },
    [params.source, params.sourceId, sources]
  );

  const sourceData = useRef<SourceData>(
    sources.find(src => src.sourceId === params.sourceId) ?? {
      sourceId: sourcePageUtils.getSourceId(params.source, sources.map(src => src.sourceId)),
      connected: false,
      sourceType: sourcePageUtils.getSourceType(connectorSource),
      sourceProtoType: snakeCase(params.source)
    } as SourceData
  );

  const sourcesTabs = useRef<Tab[]>([{
    key: 'config',
    name: 'Connection Properties',
    getComponent: (form: FormInstance) => (
      <SourceEditorConfig
        form={form}
        sourceReference={connectorSource}
        isCreateForm={editorMode === 'add'}
        initialValues={sourceData.current}
        sources={sources}
        handleTouchAnyField={setTouchedFields}
      />
    ),
    form: Form.useForm()[0]
  },
  {
    key: 'collections',
    name: 'Collections',
    getComponent: (form: FormInstance) => (
      <SourceEditorCollections
        form={form}
        initialValues={sourceData.current}
        connectorSource={connectorSource}
        handleTouchAnyField={setTouchedFields}
      />
    ),
    form: Form.useForm()[0],
    isHidden: connectorSource.isSingerType
  },
  {
    key: 'destinations',
    name: 'Linked Destinations',
    getComponent: (form: FormInstance) => (
      <SourceEditorDestinations
        form={form}
        initialValues={sourceData.current}
        projectId={projectId}
      />
    ),
    form: Form.useForm()[0],
    errorsLevel: 'warning'
  }]);

  const touchedFields = useRef<boolean>(false);

  const setTouchedFields = useCallback(() => touchedFields.current = true, []);

  const savePopoverClose = useCallback(() => switchSavePopover(false), []);
  const testConnectingPopoverClose = useCallback(() => switchTestConnectingPopover(false), []);

  const handleCancel = useCallback(() => history.push(sourcesPageRoutes.root), [history]);

  const getPromptMessage = useCallback(
    () => touchedFields.current ? 'You have unsaved changes. Are you sure you want to leave the page?': undefined,
    []
  );

  const handleTestConnection = useCallback(async() => {
    setTestConnecting(true);

    const tab = sourcesTabs.current[0];

    try {
      const errorCb = (errors) => tab.errorsCount = errors.errorFields?.length;

      const config = await validateTabForm(tab, { forceUpdate, errorCb });

      sourceData.current = {
        ...sourceData.current,
        ...makeObjectFromFieldsValues(config)
      };

      sourceData.current.connected = await sourcePageUtils.testConnection(sourceData.current);
    } catch(error) {
      switchTestConnectingPopover(true);
    } finally {
      setTestConnecting(false);
      forceUpdate();
    }
  }, [forceUpdate]);

  const handleSubmit = useCallback(() => {
    setSourceSaving(true);

    Promise
      .all(sourcesTabs.current.map(tab => validateTabForm(tab, { forceUpdate, errorCb: errors => tab.errorsCount = errors.errorFields?.length })))
      .then(async allValues => {
        sourceData.current = {
          ...sourceData.current,
          ...allValues.reduce((result: any, current: any) => {
            return {
              ...result,
              ...makeObjectFromFieldsValues(current)
            };
          }, {})
        };

        sourceData.current.connected = !sourceData.current.connected
          ? await sourcePageUtils.testConnection(sourceData.current)
          : sourceData.current.connected;

        try {
          const payload: CollectionSourceData = {
            sources: editorMode === 'edit'
              ? sources.reduce((accumulator: SourceData[], current: SourceData) => [
                ...accumulator,
                current.sourceId !== sourceData.current.sourceId
                  ? current
                  : sourceData.current
              ], [])
              : [...sources, sourceData.current]
          };

          await services.storageService.save('sources', payload, projectId);

          updateSources(payload);

          touchedFields.current = false;

          history.push(sourcesPageRoutes.root);

          message.success('New destination has been added!');
        } catch(error) {
          handleError(error, 'Something goes wrong, source hasn\'t been added');
        }
      })
      .catch(() => {
        switchSavePopover(true);
      })
      .finally(() => {
        setSourceSaving(false);
        forceUpdate();
      });
  }, [forceUpdate, editorMode, projectId, history, services.storageService, sources, updateSources]);

  const handleTabChange = useCallback((tabName: string) => {
    const path = editorMode === 'add'
      ? generatePath(sourcesPageRoutes.addExact, { source: params.source, tabName })
      : generatePath(sourcesPageRoutes.editExact, { sourceId: params.sourceId, tabName })

    history.replace(path);
  }, [history, editorMode, params]);

  useEffect(() => {
    setBreadcrumbs(withHome({
      elements: [
        { title: 'Sources', link: sourcesPageRoutes.root },
        {
          title: <PageHeader title={connectorSource?.displayName} icon={connectorSource?.pic} mode="edit" />
        }
      ]
    }));
  }, [connectorSource, setBreadcrumbs]);

  return (
    <>
      <div className={cn('flex flex-col items-stretch flex-auto')}>
        <div className={cn('flex-grow')}>
          <TabsConfigurator
            type="card"
            tabsList={sourcesTabs.current}
            defaultTabIndex={sourcesTabs.current.findIndex(tab => tab.key === params.tabName) ?? 0}
            onTabChange={handleTabChange}
          />
        </div>

        <div className="flex-shrink border-t pt-2">
          <EditorButtons
            save={{
              isRequestPending: sourceSaving,
              isPopoverVisible: savePopover,
              handlePress: handleSubmit,
              handlePopoverClose: savePopoverClose,
              titleText: 'Source editor errors',
              tabsList: sourcesTabs.current
            }}
            test={{
              isRequestPending: testConnecting,
              isPopoverVisible: testConnectingPopover && sourcesTabs.current[0].errorsCount > 0,
              handlePress: handleTestConnection,
              handlePopoverClose: testConnectingPopoverClose,
              titleText: 'Connection Properties errors',
              tabsList: [sourcesTabs.current[0]]
            }}
            handleCancel={handleCancel}
          />
        </div>
      </div>

      <Prompt message={getPromptMessage}/>
    </>
  );
};

SourceEditor.displayName = 'SourceEditor';

export { SourceEditor };
