import { pad, padStart, padEnd } from 'lodash';
import { fhirdefs, sushiExport, sushiImport, utils } from 'fsh-sushi';
import { gofshExport, processor, utils as gofshUtils } from 'gofsh';
import { fillTank, loadAndCleanDatabase } from './Processing';
import { sliceDependency } from './helpers';

const FSHTank = sushiImport.FSHTank;
const RawFSH = sushiImport.RawFSH;
const exportFHIR = sushiExport.exportFHIR;
const logger = utils.logger;
const stats = utils.stats;
const getRandomPun = utils.getRandomPun;
const Type = utils.Type;
const FHIRDefinitions = fhirdefs.FHIRDefinitions;
const { getRandomSeaCreatures, getRandomSeaCreaturesStat } = gofshUtils;

/**
 * Run GoFSH
 * Note: This function is very similar to FhirToFsh in GoFSH.
 * The only difference is that FSH Online must load dependencies into IndexedDB.
 * If FhirToFsh ever supports a way to load dependencies in the browser,
 * we can update this to simply use that function.
 * @param {array} input array of JSON definitions to be processed
 * @param {object} options - config options for GoFSH based on user input and defaults
 * dependencies: user set, defaults to []
 * @param {FHIRDefinitions} testDefs - this should only be used by the unit tests so they can provide their own definitions.
 * @returns {string} the FSH
 */
export async function runGoFSH(input, options) {
  stats.reset();

  // Read in the resources as strings
  const docs = [];
  input.forEach((resource, i) => {
    const location = `Input_${i}`;
    try {
      resource = JSON.parse(resource);
    } catch (e) {
      logger.error(`Could not parse ${location} to JSON`);
      return;
    }
    if (gofshUtils.isProcessableContent(resource, location)) {
      docs.push(new processor.WildFHIR(resource, location));
    }
  });

  // Set up the FHIRProcessor
  const lake = new processor.LakeOfFHIR(docs);
  let defs = new FHIRDefinitions();
  const fisher = new gofshUtils.MasterFisher(lake, defs);
  const fhirProcessor = new processor.FHIRProcessor(lake, fisher);

  // Process the configuration
  const configuration = fhirProcessor.processConfig(options.dependencies ?? []);

  // Load dependencies, including those inferred from an IG file, and those given as input
  let dependencies = configuration?.config.dependencies
    ? configuration?.config.dependencies.map((dep) => `${dep.packageId}#${dep.version}`)
    : [];
  dependencies = sliceDependency(dependencies.join(','));
  defs = await loadAndCleanDatabase(defs, dependencies);

  // Process the FHIR to rules, and then export to FSH
  const pkg = await gofshUtils.getResources(fhirProcessor, configuration);

  // Return the string of FSH definitions
  const fsh = new gofshExport.FSHExporter(pkg).apiExport('string');
  logger.info('Done converting definitions');
  printGoFSHresults(pkg);
  return { fsh, config: configuration?.config ?? {} };
}

/**
 * Load dependencies (FHIR R4) and run SUSHI on provided text
 *
 * @param {string} input - string containing FSH text
 * @param {object} config - Configuration for SUSHI based on user input and defaults
 * config.canonical: user set, defaults to http://example.org
 * config.version: user set, defaults to 1.0.0
 * config.FSHOnly: true
 * config.fhirVersion: [4.0.1]
 *
 * @returns Package with FHIR resources
 */
export async function runSUSHI(input, config, dependencyArr) {
  stats.reset();

  // Load dependencies
  let defs = new FHIRDefinitions();
  defs = await loadAndCleanDatabase(defs, dependencyArr);

  // Load and fill FSH Tank
  let tank = FSHTank;
  try {
    const rawFSH = [new RawFSH(input)];
    tank = fillTank(rawFSH, config);
  } catch (e) {
    logger.error('Something went wrong when importing the FSH definitions');
    return;
  }
  //Check for StructureDefinition
  const structDef = defs.fishForFHIR('StructureDefinition', Type.Resource);
  if (structDef?.version !== '4.0.1') {
    logger.error(
      'StructureDefinition resource not found for v4.0.1. The FHIR R4 package in local cache' +
        ' may be corrupt. Local FHIR cache can be found at <home-directory>/.fhir/packages.' +
        ' For more information, see https://wiki.hl7.org/FHIR_Package_Cache#Location.'
    );
    return;
  }

  logger.info('Converting FSH to FHIR resources...');
  const outPackage = exportFHIR(tank, defs);

  console.log(' ');
  printSUSHIResults(outPackage);

  // Remove snapshots
  outPackage.profiles = outPackage.profiles.map((p) => p.toJSON(false));
  outPackage.extensions = outPackage.extensions.map((e) => e.toJSON(false));
  outPackage.logicals = outPackage.logicals.map((l) => l.toJSON(false));
  outPackage.resources = outPackage.resources.map((r) => r.toJSON(false));

  return outPackage;
}

function printSUSHIResults(pkg) {
  const numError = stats.numError;
  const numWarn = stats.numWarn;
  // NOTE: These variables are creatively names to align well in the strings below while keeping prettier happy
  const profileNum = pad(pkg.profiles.length.toString(), 13);
  const extentNum = pad(pkg.extensions.length.toString(), 12);
  const logiclNum = pad(pkg.logicals.length.toString(), 12);
  const resourcNum = pad(pkg.resources.length.toString(), 13);
  const valueSetsNumber = pad(pkg.valueSets.length.toString(), 18);
  const codeSystemsNum = pad(pkg.codeSystems.length.toString(), 17);
  const instancesNumber = pad(pkg.instances.length.toString(), 18);
  const errorNumMsg = pad(`${numError} Error${numError !== 1 ? 's' : ''}`, 13);
  const wrNumMsg = padStart(`${numWarn} Warning${numWarn !== 1 ? 's' : ''}`, 12);

  const aWittyMessageInvolvingABadFishPun = padEnd(getRandomPun(numError, numWarn), 36);
  const color = numError > 0 ? 'red' : numWarn > 0 ? '#b36200' : 'green'; // eslint-disable-line no-unused-vars

  /* eslint-disable no-useless-concat */
  // NOTE: Doing some funky things w/ strings on some lines to keep overall alignment in the code
  const results = [
    '╔' + '════════════════════════ SUSHI RESULTS ══════════════════════════' + '╗',
    '║' + ' ╭───────────────┬──────────────┬──────────────┬───────────────╮ ' + '║',
    '║' + ' │    Profiles   │  Extensions  │   Logicals   │   Resources   │ ' + '║',
    '║' + ' ├───────────────┼──────────────┼──────────────┼───────────────┤ ' + '║',
    '║' + ` │ ${profileNum} │ ${extentNum} │ ${logiclNum} │ ${resourcNum} │ ` + '║',
    '║' + ' ╰───────────────┴──────────────┴──────────────┴───────────────╯ ' + '║',
    '║' + ' ╭────────────────────┬───────────────────┬────────────────────╮ ' + '║',
    '║' + ' │      ValueSets     │    CodeSystems    │     Instances      │ ' + '║',
    '║' + ' ├────────────────────┼───────────────────┼────────────────────┤ ' + '║',
    '║' + ` │ ${valueSetsNumber} │ ${codeSystemsNum} │ ${instancesNumber} │ ` + '║',
    '║' + ' ╰────────────────────┴───────────────────┴────────────────────╯ ' + '║',
    '║' + '                                                                 ' + '║',
    '╠' + '═════════════════════════════════════════════════════════════════' + '╣',
    '║' + ` ${aWittyMessageInvolvingABadFishPun} ${errorNumMsg} ${wrNumMsg} ` + '║',
    '╚' + '═════════════════════════════════════════════════════════════════' + '╝'
  ];
  results.forEach((r) => console.log(r));
  // results.forEach((r) => console.log(`%c${r}`, `color:${clr}`)); // Color formatting for browser console
}

function printGoFSHresults(pkg) {
  const proNum = pad(pkg.profiles.length.toString(), 12);
  const extNum = pad(pkg.extensions.length.toString(), 13);
  const vsNum = pad(pkg.valueSets.length.toString(), 12);
  const csNum = pad(pkg.codeSystems.length.toString(), 13);
  const instNum = pad(pkg.instances.length.toString(), 12);
  const invNum = pad(pkg.invariants.length.toString(), 13);
  const mapNum = pad(pkg.mappings.length.toString(), 12);
  const errNumMsg = pad(`${stats.numError} Error${stats.numError !== 1 ? 's' : ''}`, 12);
  const wrnNumMsg = padStart(`${stats.numWarn} Warning${stats.numWarn !== 1 ? 's' : ''}`, 12);
  const creatures = pad(getRandomSeaCreatures(), 13);
  const creatrStat = pad(getRandomSeaCreaturesStat(stats.numError, stats.numWarn), 13);
  const aWittyMessageInvolvingABadFishPun = padEnd(getRandomPun(stats.numError, stats.numWarn), 37);

  // prettier-ignore
  const results = [
    '╔'  + '═════════════════════════ GoFSH RESULTS ═════════════════════════' +'╗',
    '║' + ' ╭──────────────┬───────────────┬──────────────┬───────────────╮ ' + '║',
    '║' + ' │   Profiles   │  Extensions   │  ValueSets   │  CodeSystems  │ ' + '║',
    '║' + ' ├──────────────┼───────────────┼──────────────┼───────────────┤ ' + '║',
    '║' + ` │ ${ proNum  } │ ${  extNum  } │ ${  vsNum  } │ ${  csNum   } │ ` + '║',
    '║' + ' ╰──────────────┴───────────────┴──────────────┴───────────────╯ ' + '║',
    '║' + ' ╭──────────────┬───────────────┬──────────────┬───────────────╮ ' + '║',
    '║' + ` │  Instances   │  Invariants   │   Mappings   │ ${creatures } │ ` + '║',
    '║' + ' ├──────────────┼───────────────┼──────────────┼───────────────┤ ' + '║',
    '║' + ` │ ${ instNum } │ ${  invNum  } │ ${ mapNum  } │ ${creatrStat} │ ` + '║',
    '║' + ' ╰──────────────┴───────────────┴──────────────┴───────────────╯ ' + '║',
    '║' + '                                                                 ' + '║',
    '╠'  + '═════════════════════════════════════════════════════════════════' +'╣',
    '║' + ` ${aWittyMessageInvolvingABadFishPun } ${errNumMsg} ${wrnNumMsg} ` + '║',
    '╚'  + '═════════════════════════════════════════════════════════════════' +'╝'
  ];

  console.log(' ');
  results.forEach((r) => console.log(r));
}
