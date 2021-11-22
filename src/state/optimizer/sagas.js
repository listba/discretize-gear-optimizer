/* eslint-disable no-console */
import { put, take, race, call, all, select, cancelled, takeLeading } from 'redux-saga/effects';
import JsonUrl from 'json-url';
import * as optimizerCore from './optimizerCore';

import {
  changeControl,
  changeList,
  changeSelectedCharacter,
  getSelectedCharacter,
  getList,
  changeAllSelectedModifiers,
  changeError,
  changeAll,
  changeTemplateHelperData,
} from '../slices/controlsSlice';
import { getExtrasModifiers } from '../slices/extras';
import { getBuffsModifiers } from '../slices/buffs';
import { getExtraModifiersModifiers } from '../slices/extraModifiers';
import { getInfusionsModifiers } from '../slices/infusions';
import { getSkillsModifiers } from '../slices/skills';
import { getTraitsModifiers } from '../slices/traits';

import { INFUSIONS } from '../../utils/gw2-data';
import { ERROR, SUCCESS, WAITING } from './status';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createInput(state, modifiers) {
  const {
    control: { profession },
    form: {
      infusions: {
        primaryInfusion,
        secondaryInfusion,
        maxInfusions: maxInfusionsInput,
        primaryMaxInfusions: primaryMaxInfusionsInput,
        secondaryMaxInfusions: secondaryMaxInfusionsInput,
      },
      forcedSlots: { slots },
      priorities: {
        optimizeFor,
        weaponType,
        minBoonDuration,
        minHealingPower,
        minToughness,
        maxToughness,
        affixes,
      },
      distribution: { version, values1, values2 },
    },
  } = state;

  const parseTextNumber = (text, defaultValue) => {
    const parsed = parseInt(text, 10);
    if (Number.isNaN(parsed)) {
      return defaultValue;
    }
    return Math.max(parsed, 0);
  };

  const maxInfusions = parseTextNumber(maxInfusionsInput, 18);
  const primaryMaxInfusions = parseTextNumber(primaryMaxInfusionsInput, 18);
  const secondaryMaxInfusions = parseTextNumber(secondaryMaxInfusionsInput, 18);

  const input = {
    tags: undefined,
    profession: profession.toLowerCase(),
    weapontype: weaponType,
    affixes: affixes.map((affix) =>
      affix.toLowerCase().replace(/^\w/, (char) => char.toUpperCase()),
    ),
    forcedAffixes: slots,
    rankby: optimizeFor,
    minBoonDuration,
    minHealingPower,
    minToughness,
    maxToughness,
    maxResults: 50, // TODO MAX RESULTS
    maxInfusions,
    primaryInfusion: INFUSIONS.find((entry) => entry.id === primaryInfusion)?.attribute,
    secondaryInfusion: INFUSIONS.find((entry) => entry.id === secondaryInfusion)?.attribute,
    primaryMaxInfusions,
    secondaryMaxInfusions,
    distributionVersion: version,
    percentDistribution: values1,
    distribution: values2,
  };
  input.modifiers = modifiers;

  // temp: convert "poisoned" to "poison"
  const convertPoison = (distribution) =>
    Object.fromEntries(
      Object.entries(distribution).map(([key, value]) => [
        key === 'Poisoned' ? 'Poison' : key,
        value,
      ]),
    );

  if ({}.hasOwnProperty.call(input.distribution, 'Poisoned')) {
    input.distribution = convertPoison(input.distribution);
  }
  if ({}.hasOwnProperty.call(input.percentDistribution, 'Poisoned')) {
    input.percentDistribution = convertPoison(input.percentDistribution);
  }

  return input;
}

function* runCalc() {
  let state;
  let currentList;
  let input;
  let settings;
  let oldPercent;
  let selectedCharacterIsStale = true;
  try {
    yield delay(0);

    const reduxState = yield select();
    state = reduxState.optimizer;

    const templateHelperData = {
      profession: state.control.profession,
      traits: state.form.traits,
      skills: state.form.skills,
      extras: state.form.extras,
    };
    yield put(changeTemplateHelperData(templateHelperData));

    const modifiers = [
      ...(yield select(getExtrasModifiers) || []),
      ...(yield select(getBuffsModifiers) || []),
      ...(yield select(getExtraModifiersModifiers) || []),
      ...(yield select(getInfusionsModifiers) || []),
      ...(yield select(getSkillsModifiers) || []),
      ...(yield select(getTraitsModifiers) || []),
    ];
    yield put(changeAllSelectedModifiers(modifiers));

    console.time('Calculation');

    input = createInput(state, modifiers);

    console.groupCollapsed('Debug Info:');
    console.log('Redux State:', state);
    console.log('Input:', input);

    settings = optimizerCore.setup(input);
    console.groupEnd();

    const generatedResults = optimizerCore.calculate(settings);

    // clear the selected character on click "instantly," but actually with a small delay
    // (short calculations will update in-place without a flicker)
    let clearResultsCounter = 0;
    const clearResultsAfter = 5;

    // render list updates on a trailing throttle
    // back-to-back(to-back) list updates will only be rendered once
    let listRenderCounter = Infinity;
    const listThrottle = 3;

    for (const { percent: newPercent, isChanged, newList } of generatedResults) {
      clearResultsCounter++;
      if (clearResultsCounter === clearResultsAfter) {
        yield put(changeSelectedCharacter(null));
        selectedCharacterIsStale = false;
      }

      listRenderCounter++;
      if (isChanged) {
        currentList = newList;
        if (listRenderCounter > listThrottle) {
          listRenderCounter = 0;
        }
      }
      if (listRenderCounter === listThrottle) {
        yield put(changeList(currentList));
      }

      if (newPercent !== oldPercent) {
        yield put(changeControl({ key: 'progress', value: newPercent }));
        // console.log(`${newPercent}% done`);
        oldPercent = newPercent;
      }

      yield delay(0);
    }
    yield put(changeList(currentList));

    console.timeEnd('Calculation');
    console.time('Render Result');
    if (currentList.length > 0) {
      yield put(changeControl({ key: 'status', value: SUCCESS }));
    } else {
      yield put(changeControl({ key: 'status', value: ERROR }));
      yield put(
        changeError(
          'No result could be generated for the provided input. Please check your constraints (min boon duration, ...)!',
        ),
      );
    }

    yield delay(0);

    // automatically select the top result unless the user clicked one during the calculation
    const selectedCharacter = yield select(getSelectedCharacter);
    if (currentList && (!selectedCharacter || selectedCharacterIsStale)) {
      yield put(changeSelectedCharacter(currentList[0]));
    }

    console.timeEnd('Render Result');
  } catch (e) {
    console.groupEnd();
    // eslint-disable-next-line no-alert
    alert(`There was an error in the calculation!\n\n${e}`);
    console.log(e);
    console.log('state:', { ...state });
    console.log('input:', { ...input });
    console.log('settings:', { ...settings });
    console.log('list:', { ...currentList });
    yield put(changeControl({ key: 'status', value: WAITING }));
  } finally {
    console.groupEnd();
    if (yield cancelled()) {
      console.log(`Cancelled!`);
      console.timeEnd('Calculation');
      console.time('Render Result');
      const selectedCharacter = yield select(getSelectedCharacter);
      if (!selectedCharacter || selectedCharacterIsStale) {
        currentList = yield select(getList);
        if (currentList && currentList[0]) {
          yield put(changeSelectedCharacter(currentList[0]));
        }
      }
      console.timeEnd('Render Result');
    }
  }
}

function* watchStart() {
  while (true) {
    yield take('START');
    yield race({
      task: call(runCalc),
      cancel: take('CANCEL'),
    });
  }
}

const lib = JsonUrl('lzma');

function* exportState() {
  console.log('creating template...');
  console.time('created template');
  const reduxState = yield select();
  const state = reduxState.optimizer;

  const modifiedList = [];
  const modifiedState = {
    ...state,
    control: {
      ...state.control,
      list: modifiedList,
      selectedCharacter: null,
      allSelectedModifiers: null,
    },
  };

  const compressed = yield lib.compress(modifiedState);
  console.timeEnd('created template');
  console.log('length:', compressed.length);
  console.log(compressed);
}

function* watchExportState() {
  yield takeLeading('EXPORT_STATE', exportState);
}

function* importState() {
  try {
    console.log('restoring template...');

    // eslint-disable-next-line no-alert
    const input = window.prompt('text plz', '');
    if (!input) return;

    console.time('decompressed template');
    const modifiedState = yield lib.decompress(input);
    const state = { ...modifiedState }; // do stuff here
    console.timeEnd('decompressed template');

    console.log(JSON.stringify(state));

    console.time('applied state');
    yield put(changeAll(state));
    console.timeEnd('applied state');
  } catch (e) {
    console.log('problem restoring template');
    console.log(e);
  }
}

function* watchImportState() {
  yield takeLeading('IMPORT_STATE', importState);
}

export default function* rootSaga() {
  yield all([
    // other sagas go here
    watchStart(),
    watchExportState(),
    watchImportState(),
  ]);
}
