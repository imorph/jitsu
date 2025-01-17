// @Libs
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePath, Prompt, useHistory, useParams } from 'react-router-dom';
import { Form, message } from 'antd';
import cn from 'classnames';
// @Components
import { TabsConfigurator } from '@molecule/TabsConfigurator';
import { EditorButtons } from '@molecule/EditorButtons';
import { ComingSoon } from '@atom/ComingSoon';
import { PageHeader } from '@atom/PageHeader';
import { DestinationEditorConfig } from './DestinationEditorConfig';
import { DestinationEditorConnectors } from './DestinationEditorConnectors';
import { DestinationEditorMappings } from './DestinationEditorMappings';
// @CatalogDestinations
import { destinationsReferenceMap } from '@page/DestinationsPage/commons';
// @Types
import { FormInstance } from 'antd/es';
import { Destination } from '@catalog/destinations/types';
import { Tab } from '@molecule/TabsConfigurator';
import { CommonDestinationPageProps } from '@page/DestinationsPage';
import { withHome } from '@molecule/Breadcrumbs/Breadcrumbs.types';
// @Services
import ApplicationServices from '@service/ApplicationServices';
// @Routes
import { destinationPageRoutes } from '@page/DestinationsPage/DestinationsPage.routes';
// @Styles
import styles from './DestinationEditor.module.less';
// @Utils
import { makeObjectFromFieldsValues } from '@util/forms/marshalling';
import { destinationEditorUtils } from '@page/DestinationsPage/partials/DestinationEditor/DestinationEditor.utils';
import { getUniqueAutoIncId, randomId } from '@util/numbers';
// @Hooks
import { useForceUpdate } from '@hooks/useForceUpdate';

const DestinationEditor = ({ destinations, setBreadcrumbs, updateDestinations, editorMode }: CommonDestinationPageProps) => {
  const history = useHistory();

  const forceUpdate = useForceUpdate();

  const params = useParams<{ type?: string; id?: string; tabName?: string; }>();

  const [testConnecting, setTestConnecting] = useState<boolean>(false);
  const [testConnectingPopover, switchTestConnectingPopover] = useState<boolean>(false);

  const [savePopover, switchSavePopover] = useState<boolean>(false);
  const [destinationSaving, setDestinationSaving] = useState<boolean>(false);

  const destinationData = useRef<DestinationData>(
    destinations.find(dst => dst._id === params.id) || {
      _id: getUniqueAutoIncId(params.type, destinations.map(dst => dst._type)),
      _uid: randomId(),
      _type: params.type,
      _mappings: { _keepUnmappedFields: true },
      _comment: null,
      _onlyKeys: []
    } as DestinationData
  );

  const destinationReference = useMemo<Destination>(() => {
    if (params.type) {
      return destinationsReferenceMap[params.type]
    }

    return destinationsReferenceMap[destinationData.current._type];
  }, [params.type]);

  const services = useMemo(() => ApplicationServices.get(), []);

  const touchedFields = useRef<boolean>(false);

  const destinationsTabs = useRef<Tab[]>([{
    key: 'config',
    name: 'Connection Properties',
    getComponent: (form: FormInstance) => <DestinationEditorConfig handleTouchAnyField={setTouchedFields} form={form} destinationReference={destinationReference} destinationData={destinationData.current} />,
    form: Form.useForm()[0]
  },
  {
    key: 'mappings',
    name: 'Mappings',
    getComponent: (form: FormInstance) => <DestinationEditorMappings form={form} initialValues={destinationData.current?._mappings} />,
    form: Form.useForm()[0]
  },
  {
    key: 'sources',
    name: 'Linked Connectors & API Keys',
    getComponent: (form: FormInstance) => <DestinationEditorConnectors form={form} initialValues={destinationData.current} destination={destinationReference} />,
    form: Form.useForm()[0],
    errorsLevel: 'warning'
  },
  {
    key: 'settings',
    name: <ComingSoon render="Settings Library" documentation={<>A predefined library of settings such as <a href="https://jitsu.com/docs/other-features/segment-compatibility" target="_blank" rel="noreferrer">Segment-like schema</a></>} />,
    isDisabled: true
  },
  {
    key: 'statistics',
    name: <ComingSoon render="Statistics" documentation={<>A detailed statistics on how many events have been sent to the destinations</>} />,
    isDisabled: true
  }]);

  const setTouchedFields = useCallback(() => touchedFields.current = true, []);

  const getPromptMessage = useCallback(() => touchedFields.current
    ? 'You have unsaved changes. Are you sure you want to leave the page?'
    : undefined, []);

  const handleCancel = useCallback(() => history.push(destinationPageRoutes.root), [history]);

  const testConnectingPopoverClose = useCallback(() => switchTestConnectingPopover(false), []);
  const savePopoverClose = useCallback(() => switchSavePopover(false), []);

  const validateTabForm = useCallback(async(tab: Tab) => {
    const form = tab.form;

    try {
      if (tab.key === 'sources') {
        const _sources = form.getFieldsValue()?._sources;

        if (!_sources) {
          tab.errorsCount = 1;
        }
      }

      return await form.validateFields();
    } catch (errors) {
      // ToDo: check errors count for fields with few validation rules
      tab.errorsCount = errors.errorFields?.length;

      forceUpdate();

      throw errors;
    }
  }, [forceUpdate]);

  const handleTestConnection = useCallback(async() => {
    setTestConnecting(true);

    const tab = destinationsTabs.current[0];

    try {
      const config = await validateTabForm(tab);

      destinationData.current._formData = makeObjectFromFieldsValues<DestinationData>(config)._formData;

      await destinationEditorUtils.testConnection(destinationData.current);
    } catch (error) {
      switchTestConnectingPopover(true);
    } finally {
      setTestConnecting(false);
      forceUpdate();
    }
  }, [validateTabForm, forceUpdate]);

  const handleSubmit = useCallback(() => {
    setDestinationSaving(true);

    Promise
      .all(destinationsTabs.current.filter((tab: Tab) => !!tab.form).map((tab: Tab) => validateTabForm(tab)))
      .then(async allValues => {
        destinationData.current = {
          ...destinationData.current,
          ...allValues.reduce((result: any, current: any) => {
            return {
              ...result,
              ...makeObjectFromFieldsValues(current)
            };
          }, {})
        };

        if (destinationData.current._mappings?._keepUnmappedFields) {
          destinationData.current._mappings._keepUnmappedFields = Boolean(destinationData.current._mappings._keepUnmappedFields);
        }

        try {
          await destinationEditorUtils.testConnection(destinationData.current);

          const payload = {
            destinations: editorMode === 'add'
              ? [...destinations, destinationData.current]
              : destinations.reduce((accumulator: DestinationData[], current: DestinationData) => [
                ...accumulator,
                current._uid !== destinationData.current._uid
                  ? current
                  : destinationData.current
              ], [])
          };

          await services.storageService.save('destinations', payload, services.activeProject.id);

          updateDestinations(payload);

          touchedFields.current = false;

          history.push(destinationPageRoutes.root);

          message.success('New destination has been added!');
        } catch (errors) {}
      })
      .catch(() => {
        switchSavePopover(true);
      })
      .finally(() => {
        setDestinationSaving(false);
        forceUpdate();
      });
  }, [history, services, validateTabForm, destinations, updateDestinations, forceUpdate, editorMode]);

  const handleTabChange = useCallback((tabName: string) => {
    const path = editorMode === 'add'
      ? generatePath(destinationPageRoutes.newDestination, { type: params.type, tabName })
      : generatePath(destinationPageRoutes.editDestination, { id: params.id, tabName })

    history.replace(path);
  }, [history, editorMode, params]);

  useEffect(() => {
    setBreadcrumbs(withHome({
      elements: [
        { title: 'Destinations', link: destinationPageRoutes.root },
        {
          title: <PageHeader title={destinationReference.displayName} icon={destinationReference.ui.icon} mode="edit" />
        }
      ]
    }));
  }, [destinationReference, setBreadcrumbs]);

  return (
    <>
      <div className={cn('flex flex-col items-stretch flex-auto', styles.wrapper)}>
        <div className={cn('flex-grow', styles.mainArea)} id="dst-editor-tabs">
          <TabsConfigurator
            type="card"
            className={styles.tabCard}
            tabsList={destinationsTabs.current}
            defaultTabIndex={destinationsTabs.current.findIndex(tab => tab.key === params.tabName) ?? 0}
            onTabChange={handleTabChange}
          />
        </div>

        <div className="flex-shrink border-t pt-2">
          <EditorButtons
            save={{
              isRequestPending: destinationSaving,
              isPopoverVisible: savePopover,
              handlePress: handleSubmit,
              handlePopoverClose: savePopoverClose,
              titleText: 'Destination editor errors',
              tabsList: destinationsTabs.current
            }}
            test={{
              isRequestPending: testConnecting,
              isPopoverVisible: testConnectingPopover && destinationsTabs.current[0].errorsCount > 0,
              handlePress: handleTestConnection,
              handlePopoverClose: testConnectingPopoverClose,
              titleText: 'Connection Properties errors',
              tabsList: [destinationsTabs.current[0]]
            }}
            handleCancel={handleCancel}
          />
        </div>
      </div>

      <Prompt message={getPromptMessage}/>
    </>
  );
};

DestinationEditor.displayName = 'DestinationEditor';

export { DestinationEditor }
