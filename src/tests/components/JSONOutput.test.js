import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { unmountComponentAtNode } from 'react-dom';
import JSONOutput from '../../components/JSONOutput';

beforeAll(() => {
  document.body.createTextRange = () => {
    return {
      getBoundingClientRect: () => ({ right: 0 }),
      getClientRects: () => ({ left: 0 })
    };
  };
});

let container = null;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  unmountComponentAtNode(container);
  container.remove();
  container = null;
});

it('Renders with the placeholder text if showNewText is false and no text', () => {
  // Initial case, nothing from SUSHI is displayed
  const { getByText } = render(<JSONOutput showNewText={false} text={''} />, container);

  const placeholderText = getByText(/Paste or edit single FHIR JSON artifact here.../i);

  expect(placeholderText).toBeInTheDocument();
});

it('Renders with the proper text and updates with proper text when loading', () => {
  const { getByText } = render(<JSONOutput showNewText={false} text={''} isWaiting={true} />, container);

  const loadingPlaceholderText = getByText('Loading...');

  expect(loadingPlaceholderText).toBeInTheDocument();
});

// TODO: CodeMirrorComponent doesn't get the package text properly - not sure why
it.skip('Renders with the first profile when text is an object (SUSHI Package)', async () => {
  const { getByText } = render(
    <JSONOutput
      showNewText={true}
      text={JSON.stringify(
        {
          profiles: [
            {
              resourceType: 'StructureDefinition',
              id: 'A'
            }
          ],
          extensions: [],
          logicals: [],
          resources: [],
          instances: [],
          valueSets: [],
          codeSystems: []
        },
        null,
        2
      )}
      isWaiting={true}
      updateTextValue={(text) => text}
      setShowNewText={() => {}}
    />,
    container
  );

  // Because the editor is in JSON mode, the text is split up differently than the fsh mode
  const resultsElement = getByText(
    (content, element) => element.tagName.toLowerCase() === 'span' && content.startsWith('resourceType')
  );
  expect(resultsElement).toBeInTheDocument(); // showNewText is true so results are printed
  expect(resultsElement.parentNode.text).toEqual();
});

it('renders a delete button in editor header that opens a confirmation and then deletes the definition', () => {
  const updateText = jest.fn();
  const simplePackage = {
    profiles: [
      {
        resourceType: 'StructureDefinition',
        id: 'ProfileA',
        kind: 'resource',
        derivation: 'constraint'
      },
      {
        resourceType: 'StructureDefinition',
        id: 'ProfileB',
        kind: 'resource',
        derivation: 'constraint'
      }
    ],
    extensions: [],
    logicals: [],
    resources: [],
    instances: [],
    valueSets: [],
    codeSystems: []
  };
  const stringifiedPackageAfterDelete = [
    { resourceType: 'Profile', id: 'ProfileA', def: JSON.stringify(simplePackage.profiles[0], null, 2) }
  ];

  const { getByRole, getByText, queryByText } = render(
    <JSONOutput
      showNewText={true}
      setShowNewText={() => {}}
      isWaiting={false}
      updateTextValue={updateText}
      text={JSON.stringify(simplePackage, null, 2)}
    />,
    container
  );

  // Switch to ProfileB in order to delete it
  updateText.mockReset();
  const profileBDef = getByText('ProfileB');
  fireEvent.click(profileBDef);
  expect(updateText).toHaveBeenCalledTimes(1);

  const deleteActionButton = getByRole('button', { name: /delete/i });
  expect(deleteActionButton).toBeInTheDocument();
  let deleteButton = queryByText('Delete');
  expect(deleteButton).not.toBeInTheDocument();

  // Clicking the delete button the editor header opens the modal for that definition
  fireEvent.click(deleteActionButton);
  deleteButton = queryByText('Delete');
  expect(deleteButton).toBeInTheDocument();
  const dialogBox = deleteButton.parentNode.parentNode.parentNode; // Not sure why this can't be selected with a label
  expect(dialogBox.textContent).toContain('Are you sure you want to delete Profile ProfileB?');

  // Clicking delete confirmation deletes the definition
  updateText.mockReset();
  fireEvent.click(deleteButton);
  expect(updateText).toHaveBeenCalledTimes(2); // Called once from handleCloseAndDelete and once from updateTextValue
  expect(updateText).toHaveBeenCalledWith(stringifiedPackageAfterDelete);
});

it('Renders an Add Definition button that adds a blank definition', () => {
  const simpleProfile = {
    profiles: [
      {
        resourceType: 'StructureDefinition',
        id: 'SimpleProfile'
      }
    ],
    extensions: [],
    logicals: [],
    resources: [],
    instances: [],
    valueSets: [],
    codeSystems: []
  };
  const { getByText, queryByText } = render(
    <JSONOutput
      showNewText={true}
      setShowNewText={() => {}}
      isWaiting={false}
      updateTextValue={() => {}}
      text={JSON.stringify(simpleProfile, null, 2)}
    />,
    container
  );

  const addButton = getByText('New JSON Editor');
  let placeholderText = queryByText(/Paste or edit single FHIR JSON artifact here.../i);
  expect(addButton).toBeInTheDocument();
  expect(placeholderText).not.toBeInTheDocument();

  fireEvent.click(addButton);

  // Add clears out the editor for a new blank definition and displays placeholder text
  placeholderText = queryByText(/Paste or edit single FHIR JSON artifact here.../i);
  expect(placeholderText).toBeInTheDocument();
});

describe('file tree display', () => {
  let sushiPackage;
  beforeAll(() => {
    sushiPackage = {
      profiles: [
        {
          resourceType: 'StructureDefinition',
          id: 'ProfileA',
          kind: 'resource',
          derivation: 'constraint'
        },
        {
          resourceType: 'StructureDefinition',
          id: 'ProfileB',
          kind: 'complex-type',
          derivation: 'constraint'
        }
      ],
      extensions: [
        {
          resourceType: 'StructureDefinition',
          id: 'ExtensionA',
          kind: 'complex-type',
          derivation: 'constraint',
          type: 'Extension'
        }
      ],
      logicals: [
        {
          resourceType: 'StructureDefinition',
          id: 'LogicalA',
          kind: 'logical',
          derivation: 'specialization'
        }
      ],
      resources: [
        {
          resourceType: 'StructureDefinition',
          id: 'ResourceA',
          kind: 'resource',
          derivation: 'specialization'
        }
      ],
      instances: [
        {
          resourceType: 'Patient',
          id: 'MyPatient'
        },
        {
          resourceType: 'Observation',
          id: 'AnObservationExample'
        },
        {
          resourceType: 'StructureDefinition',
          id: 'AStructureDefinitionInstance'
        }
      ],
      valueSets: [
        {
          resourceType: 'ValueSet',
          id: 'MyValueSet'
        }
      ],
      codeSystems: [
        {
          resourceType: 'CodeSystem',
          id: 'MyCS'
        }
      ]
    };
  });

  it('renders a list of JSON definitions in a file tree', () => {
    const { getAllByTestId } = render(
      <JSONOutput
        showNewText={true}
        setShowNewText={() => {}}
        isWaiting={false}
        updateTextValue={() => {}}
        text={JSON.stringify(sushiPackage, null, 2)}
      />,
      container
    );

    const profileList = getAllByTestId('Profiles-defId');
    const extensionsList = getAllByTestId('Extensions-defId');
    const logicalsList = getAllByTestId('Logical Models-defId');
    const resourcesList = getAllByTestId('Resources-defId');
    const vsList = getAllByTestId('ValueSets-defId');
    const csList = getAllByTestId('CodeSystems-defId');
    const instanceList = getAllByTestId('Instances-defId');

    expect(profileList).toHaveLength(2); // Profiles get their own category
    expect(profileList[0].textContent).toEqual('ProfileA'); // Sorted alphabetically
    expect(profileList[1].textContent).toEqual('ProfileB');

    expect(extensionsList).toHaveLength(1); // Extensions get their own category
    expect(extensionsList[0].textContent).toEqual('ExtensionA');

    expect(logicalsList).toHaveLength(1); // Logicals get their own category
    expect(logicalsList[0].textContent).toEqual('LogicalA');

    expect(resourcesList).toHaveLength(1); // Resources get their own category
    expect(resourcesList[0].textContent).toEqual('ResourceA');

    expect(vsList).toHaveLength(1); // VS get their own category
    expect(vsList[0].textContent).toEqual('MyValueSet');

    expect(csList).toHaveLength(1); // CS get their own category
    expect(csList[0].textContent).toEqual('MyCS');

    expect(instanceList).toHaveLength(3); // All other resourceTypes are grouped to Instances, including StructureDefinitions that do not fit a FSH entity type
    expect(instanceList[0].textContent).toEqual('AnObservationExample'); // Sorted alphabetically
    expect(instanceList[1].textContent).toEqual('AStructureDefinitionInstance');
    expect(instanceList[2].textContent).toEqual('MyPatient');
  });

  it('resets currentDef and initialText of editor when a new definition is clicked', () => {
    const { getByText } = render(
      <JSONOutput
        showNewText={true}
        setShowNewText={() => {}}
        isWaiting={false}
        updateTextValue={() => {}}
        text={JSON.stringify(sushiPackage, null, 2)}
      />,
      container
    );

    const extensionDef = getByText('ExtensionA');
    expect(extensionDef.className).toContain('listItem');
    expect(extensionDef.className).not.toContain('listItemSelected');
    fireEvent.click(extensionDef);
    expect(extensionDef.className).toContain('listItemSelected');
    // Can also test that the text in the editor updates when we can access the text correctly
  });

  it('displays Untitled if a definition does not have an id', () => {
    const profileWithoutId = {
      profiles: [
        {
          resourceType: 'StructureDefinition'
          // No id field - this is to represent the case when someone removed or never included an id. SUSHI packages should always have ids.
        }
      ],
      extensions: [],
      logicals: [],
      resources: [],
      instances: [],
      valueSets: [],
      codeSystems: []
    };
    const { getByText } = render(
      <JSONOutput
        showNewText={true}
        setShowNewText={() => {}}
        isWaiting={false}
        updateTextValue={() => {}}
        text={JSON.stringify(profileWithoutId, null, 2)}
      />,
      container
    );

    const untitledDef = getByText('Untitled');
    expect(untitledDef).toBeInTheDocument();
  });

  it('sorts a definition to Unknown Type if a definition does not have a resourceType', () => {
    const profileWithoutId = {
      profiles: [
        {
          id: 'NoType'
          // No resourceType field - this is to represent the case when someone removed or never included a resourceType. SUSHI packages should always have ids.
        }
      ],
      extensions: [],
      logicals: [],
      resources: [],
      instances: [],
      valueSets: [],
      codeSystems: []
    };
    const { getAllByTestId } = render(
      <JSONOutput
        showNewText={true}
        setShowNewText={() => {}}
        isWaiting={false}
        updateTextValue={() => {}}
        text={JSON.stringify(profileWithoutId, null, 2)}
      />,
      container
    );

    const unknownList = getAllByTestId('Unknown Type-defId');
    expect(unknownList).toHaveLength(1); // Unknown types get their own category
    expect(unknownList[0].textContent).toEqual('NoType');
  });
});
