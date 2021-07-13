import React, { useState, useEffect } from 'react';
import { groupBy, isEqual } from 'lodash';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { Button, List, ListItem, Tooltip } from '@material-ui/core';
import { Add, ErrorOutline } from '@material-ui/icons';
import CodeMirrorComponent from './CodeMirrorComponent';
import DeleteConfirmationModal from './DeleteConfirmationModal';

const useStyles = makeStyles((theme) => ({
  fileTreeContent: {
    overflowY: 'scroll',
    height: '100%'
  },
  button: {
    color: theme.palette.common.white,
    background: theme.palette.success.main,
    '&:hover': {
      background: theme.palette.success.dark
    },
    border: '8px solid white',
    fontSize: '13px',
    width: '100%'
  },
  list: {
    padding: '8px',
    paddingLeft: '0px',
    paddingBottom: '0px',
    fontSize: '13px'
  },
  listItemError: {
    paddingTop: '5px',
    paddingBottom: '5px',
    margin: 0
  },
  listItem: {
    background: theme.palette.common.lightestGrey,
    paddingTop: '5px',
    paddingBottom: '5px',
    marginTop: '5px',
    marginBottom: '5px',
    paddingLeft: '5px',
    // paddingRight is driven by ListItem (16px)
    margin: 0,
    '&:hover': {
      background: theme.palette.common.lightGrey
    },

    // Ellipse for long resource ids
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  listItemSelected: {
    background: theme.palette.common.editorGrey, // editor background color
    color: theme.palette.common.white,
    '&:hover': {
      background: theme.palette.common.darkestGrey
    }
  },
  listHeader: {
    padding: '5px',
    paddingLeft: '15px'
  },
  listIcon: {
    color: theme.palette.success.main,
    verticalAlign: 'middle',
    fontSize: '13px',
    paddingLeft: '3px',
    paddingRight: '3px'
  },
  listIconError: {
    color: theme.palette.common.red
  },
  blankIcon: {
    paddingLeft: '19px' // width of icon
  }
}));

const checkFshType = (def) => {
  // The criteria in this function is based on isSDForInstance in GoFSH (LakeOfFHIR.ts)
  // A Profile has kind "resource", "complex-type", or "primitive-type" and derivation "constraint".
  // An Extension has kind "complex-type", derivation "constraint", and type "Extension". It's a special case of Profile.
  // A Logical has kind "logical" and derivation "specialization".
  // A Resource has kind "resource" and derivation "specialization".
  // Any other combination of values for kind and derivation represents an Instance.
  if (def.resourceType === 'ValueSet' || def.resourceType === 'CodeSystem') {
    return def.resourceType;
  } else if (def.resourceType === 'StructureDefinition') {
    if (def.derivation === 'specialization') {
      if (def.kind === 'resource') {
        return 'Resource';
      } else if (def.kind === 'logical') {
        return 'Logical Model';
      }
    } else if (def.derivation === 'constraint') {
      if (def.kind === 'complex-type' && def.type === 'Extension') {
        return 'Extension';
      } else if (['resource', 'complex-type', 'primitive-type'].includes(def.kind)) {
        return 'Profile';
      }
    }
  }

  // We could have an instance of a SD that can't be a Profile, Extension, Logical, or Resource
  // So we want to check for any resource that hasn't already been categorized
  if (def.resourceType != null) {
    return 'Instance';
  }

  // Otherwise we don't know the type. This will default to 'Unknown Type' if it is missing.
  return null;
};

// Flatten the package so we can render and navigate it more easily,
// but keep high level attributes we'll need accessible
const getIterablePackage = (defsPackage) => {
  const defArray = [
    ...defsPackage.profiles,
    ...defsPackage.extensions,
    ...defsPackage.logicals,
    ...defsPackage.resources,
    ...defsPackage.instances,
    ...defsPackage.valueSets,
    ...defsPackage.codeSystems
  ];
  return defArray.map((def) => ({ resourceType: checkFshType(def), id: def.id, def: JSON.stringify(def, null, 2) }));
};

export default function JSONOutput(props) {
  const classes = useStyles();
  const [initialText, setInitialText] = useState('');
  const [fhirDefinitions, setFhirDefinitions] = useState([{ resourceType: null, id: 'Untitled', def: null }]);
  const { setShowNewText, updateTextValue: propsUpdateText } = props;
  const [currentDef, setCurrentDef] = useState(0);
  const [defsWithErrors, setDefsWithErrors] = useState([]);
  const [openDeleteConfirmation, setOpenDeleteConfirmation] = useState(false);

  useEffect(() => {
    // This case represents when we receive a new Package from SUSHI
    if (props.showNewText && !isEqual(props.text, [''])) {
      setShowNewText(false); // Indicate that we no longer have new data we need to load so we don't come back here too early
      let packageJSON;
      try {
        packageJSON = JSON.parse(props.text);
      } catch (e) {
        packageJSON = {
          profiles: [],
          extensions: [],
          logicals: [],
          resources: [],
          instances: [],
          valueSets: [],
          codeSystems: []
        };
      }
      const iterablePackage = getIterablePackage(packageJSON);
      setFhirDefinitions(iterablePackage);
      setCurrentDef(0);
      setInitialText(iterablePackage.length > 0 ? iterablePackage[0].def : '');
      propsUpdateText(iterablePackage); // The value of text kept on props should be the iterable and stringified package
    } else if (props.isWaiting) {
      setInitialText(null); // Reset the text to null when loading to reset the editor and display placeholder text
      setFhirDefinitions([]); // Reset FHIR definitions to clear out file tree
    }
  }, [props.text, props.showNewText, props.isWaiting, propsUpdateText, setShowNewText]);

  const updateTextValue = (text) => {
    // We're waiting for a new package to load, so we don't want the editor to update yet
    if (props.isWaiting) return;

    // Update the definition we're currently editing
    const updatedDefs = [...fhirDefinitions];

    // Check if there is a JSON syntax error in the editor
    try {
      // If the editor is blank, we want to consider it an empty JSON object so that it is valid JSON
      const latestJSON = text === '' ? {} : JSON.parse(text);
      // If there was an error, mark it as resolved
      if (defsWithErrors.includes(currentDef)) {
        const newErrors = [...defsWithErrors];
        newErrors.splice(defsWithErrors.indexOf(currentDef), 1);
        setDefsWithErrors(newErrors);
      }

      // If it's new, set metadata (definition text is set below)
      if (!fhirDefinitions[currentDef]) {
        updatedDefs[currentDef] = {
          resourceType: checkFshType(latestJSON),
          id: latestJSON.id ?? 'Untitled'
        };
      }

      // Update resource type if it has changed
      if (!fhirDefinitions[currentDef] || latestJSON.resourceType !== fhirDefinitions[currentDef].resourceType) {
        updatedDefs[currentDef].resourceType = checkFshType(latestJSON);
      }

      // Update id if it has changed or it is new
      if (!fhirDefinitions[currentDef] || latestJSON.id !== fhirDefinitions[currentDef].id) {
        updatedDefs[currentDef].id = latestJSON.id ?? 'Untitled';
      }
    } catch (e) {
      // Invalid JSON typed. Keep track of index.
      if (!defsWithErrors.includes(currentDef)) {
        const newErrors = [...defsWithErrors];
        newErrors.push(currentDef);
        setDefsWithErrors(newErrors);
      }
    }

    // Update the text - regardless if it was valid JSON
    if (updatedDefs[currentDef]) {
      updatedDefs[currentDef].def = text;
    }
    setFhirDefinitions(updatedDefs);
    props.updateTextValue(updatedDefs);

    // This is a bit of a hack to make sure the editor can be reset by a setInitialText(null)
    if (initialText === null) {
      setInitialText(text);
    }
  };

  const addDefinition = () => {
    const updatedDefs = [...fhirDefinitions];
    updatedDefs.push({ resourceType: null, id: 'Untitled', def: null });
    setCurrentDef(updatedDefs.length - 1);
    setFhirDefinitions(updatedDefs);
    setInitialText(null);
    props.updateTextValue(updatedDefs);
  };

  const handleCloseAndDelete = () => {
    const index = currentDef;
    const updatedDefs = [...fhirDefinitions];
    updatedDefs.splice(index, 1); // Remove definition to be deleted
    if (updatedDefs.length === 0) {
      // Ensure list is not empty so there is always a definition in the file tree
      updatedDefs.push({ resourceType: null, id: 'Untitled', def: null });
    }
    setFhirDefinitions(updatedDefs);

    // If we deleted the currently viewed definition or any before it, update it
    if (index <= currentDef) {
      let newCurrentDef = 0;
      if (index < currentDef) {
        newCurrentDef = currentDef - 1;
      }
      setCurrentDef(newCurrentDef);
      const newCurrentDefText = updatedDefs.length > 0 ? updatedDefs[newCurrentDef].def : null;
      setInitialText(newCurrentDefText);
    }

    // Update error tracking
    const newErrors = [...defsWithErrors];
    if (defsWithErrors.includes(index)) {
      // If the definition had an error, remove it from the list
      newErrors.splice(defsWithErrors.indexOf(index), 1);
    }
    // Shift any indices that came after the deleted definition to properly track errors
    const shiftedErrors = newErrors.map((i) => (i < index ? i : i - 1));
    setDefsWithErrors(shiftedErrors);

    setOpenDeleteConfirmation(false);
    props.updateTextValue(updatedDefs);
  };

  const handleOpenDeleteConfirmation = () => {
    setOpenDeleteConfirmation(true);
  };

  const handleCloseDeleteConfirmation = () => {
    setOpenDeleteConfirmation(false);
  };

  const renderDeleteModal = () => {
    const defToDelete = fhirDefinitions[currentDef];
    if (!defToDelete) {
      return;
    }
    const type = defToDelete.resourceType || 'Unknown Type';
    const id = defToDelete.id || 'Untitled';
    return (
      <DeleteConfirmationModal
        title={'FHIR JSON'}
        item={`${type} ${id}`}
        isOpen={openDeleteConfirmation}
        handleCloseModal={handleCloseDeleteConfirmation}
        handleDelete={handleCloseAndDelete}
      />
    );
  };

  const renderFileTreeView = () => {
    const order = [
      'Profiles',
      'Extensions',
      'Logical Models',
      'Resources',
      'ValueSets',
      'CodeSystems',
      'Instances',
      'Unknown Type'
    ];
    const grouped = groupBy(fhirDefinitions, (val) => {
      if (val && val.resourceType) return `${val.resourceType}s`;
      return 'Unknown Type';
    });

    return Object.keys(grouped)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b)) // Sort so we keep a defined order of types in the tree
      .map((key) => {
        return (
          <List component="nav" key={key} className={classes.list}>
            <div className={classes.listHeader}>{key}</div>
            {grouped[key]
              .sort((a, b) => {
                const aId = a.id ? a.id : 'Untitled'; // Treat missing or blank ids as "Untitled"
                const bId = b.id ? b.id : 'Untitled';
                return aId.toLowerCase() < bId.toLowerCase() ? -1 : aId.toLowerCase() > bId.toLowerCase() ? 1 : 0;
              }) // Sort ids alphabetically
              .map((def, i) => {
                const currentIndex = fhirDefinitions.indexOf(def);
                const isError = defsWithErrors.includes(currentIndex);
                return (
                  <ListItem
                    button
                    key={i}
                    title={def?.id || 'Untitled'}
                    data-testid={`${key}-defId`}
                    className={clsx(
                      classes.listItem,
                      isError && classes.listItemError,
                      currentIndex === currentDef && classes.listItemSelected
                    )}
                    onClick={() => {
                      setCurrentDef(currentIndex);
                      setInitialText(def.def);
                    }}
                  >
                    {defsWithErrors.includes(currentIndex) ? (
                      <Tooltip title="Invalid JSON" placement="top" arrow>
                        <ErrorOutline className={clsx(classes.listIcon, classes.listIconError)} />
                      </Tooltip>
                    ) : (
                      <span className={classes.blankIcon} />
                    )}
                    {def?.id || 'Untitled'}
                  </ListItem>
                );
              })}
          </List>
        );
      });
  };

  const renderDrawer = () => {
    return (
      <>
        <Button className={classes.button} startIcon={<Add />} onClick={addDefinition}>
          New JSON Editor
        </Button>
        <div className={classes.fileTreeContent}>{renderFileTreeView()}</div>
      </>
    );
  };

  const displayValue = fhirDefinitions.length > 0 ? fhirDefinitions[currentDef].def : null;

  return (
    <>
      <CodeMirrorComponent
        name={`FHIR JSON: ${fhirDefinitions.length > 0 ? fhirDefinitions[currentDef].id : 'Untitled'}`}
        value={displayValue}
        initialText={initialText}
        updateTextValue={updateTextValue}
        mode={'application/json'}
        placeholder={
          props.isWaiting
            ? 'Loading...'
            : 'Paste or edit single FHIR JSON artifact here... \nCreate additional FHIR JSON artifacts to the right.'
        }
        renderDrawer={renderDrawer}
        isExamples={false}
        delete={handleOpenDeleteConfirmation}
      />
      {openDeleteConfirmation && renderDeleteModal()}
    </>
  );
}
