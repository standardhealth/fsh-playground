import React, { useState, useEffect } from 'react';
import { inflateSync } from 'browserify-zlib';
import { makeStyles } from '@material-ui/core/styles';
import { Grid } from '@material-ui/core';
import { expandLink } from './utils/BitlyWorker';
import TopBar from './components/TopBar';
import JSONOutput from './components/JSONOutput';
import ConsoleComponent from './components/ConsoleComponent';
import CodeMirrorComponent from './components/CodeMirrorComponent';
import SUSHIControls from './components/SUSHIControls';

const useStyles = makeStyles((theme) => ({
  container: {
    flexGrow: 1
  },
  itemTop: {
    height: '85vh'
  },
  console: {
    height: '20vh'
  }
}));

const log = console.log; //eslint-disable-line no-unused-vars
let consoleMessages = [];
let errorAndWarningMessages = [];
let errorCount = 0;
let warningCount = 0;
console.log = function getMessages(message) {
  consoleMessages.push(message);
  if (message && (message.startsWith('error') || message.startsWith('warn'))) {
    errorAndWarningMessages.push(message);
    if (message.startsWith('error')) errorCount++;
    else warningCount++;
  }
};

export async function decodeFSH(encodedFSH) {
  if (encodedFSH.text === undefined) {
    return 'Edit FSH here!';
  } else {
    const promisedURL = await expandLink(encodedFSH);

    // Removes the encoded data from the end of the url, starting at index 38
    const sliced64 = promisedURL.long_url.slice(40);
    if (!promisedURL.long_url.includes('https://fshschool.org/FSHOnline/#/share/') || sliced64.length === 0) {
      return 'Edit FSH here!';
    } else {
      const displayText = inflateSync(Buffer.from(sliced64, 'base64')).toString('utf-8');
      return displayText;
    }
  }
}

export default function App(props) {
  const classes = useStyles();
  const text64 = props.match.params;
  const [doRunSUSHI, setDoRunSUSHI] = useState(false);
  const [inputText, setInputText] = useState('Edit FSH here!');
  const [initialText, setInitialText] = useState('Edit FSH here!');
  const [outputText, setOutputText] = useState('Your JSON Output Will Display Here: ');
  const [isOutputObject, setIsOutputObject] = useState(false);
  const [expandConsole, setExpandConsole] = useState(false);

  useEffect(() => {
    async function waitForFSH() {
      setInitialText(await decodeFSH(text64));
    }
    waitForFSH();
  }, [text64]);

  function resetLogMessages() {
    consoleMessages = [];
    errorAndWarningMessages = [];
    errorCount = 0;
    warningCount = 0;
  }

  function handleSUSHIControls(doRunSUSHI, sushiOutput, isObject) {
    setDoRunSUSHI(doRunSUSHI);
    setOutputText(sushiOutput);
    setIsOutputObject(isObject);
  }

  function updateInputTextValue(text) {
    setInputText(text);
  }

  return (
    <div className="root">
      <TopBar />
      <SUSHIControls onClick={handleSUSHIControls} text={inputText} resetLogMessages={resetLogMessages} />
      <Grid className={classes.container} container>
        <Grid style={{ height: expandConsole ? '55vh' : '85vh' }} item xs={6}>
          <CodeMirrorComponent value={inputText} initialText={initialText} updateTextValue={updateInputTextValue} />
        </Grid>
        <Grid style={{ height: expandConsole ? '55vh' : '85vh' }} item xs={6}>
          <JSONOutput
            displaySUSHI={doRunSUSHI}
            text={outputText}
            isObject={isOutputObject}
            errorsAndWarnings={errorAndWarningMessages}
          />
        </Grid>
        <Grid item xs={12}>
          <ConsoleComponent
            style={{ height: expandConsole ? '35vh' : '20vh' }}
            consoleMessages={consoleMessages}
            warningCount={warningCount}
            errorCount={errorCount}
            expandConsole={expandConsole}
            setExpandConsole={setExpandConsole}
          />
        </Grid>
      </Grid>
    </div>
  );
}
