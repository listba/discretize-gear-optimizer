import {
  Box,
  FormControl,
  Grid,
  Input,
  InputAdornment,
  InputLabel,
  makeStyles,
  Typography,
} from '@material-ui/core';
import classNames from 'classnames';
import { useTranslation } from 'gatsby-plugin-react-i18next';
import { Attribute as AttributeRaw, Condition as ConditionRaw } from 'gw2-ui-bulk';
import debounce from 'lodash.debounce';
import Nouislider from 'nouislider-react';
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved
import 'nouislider/distribute/nouislider.css';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  changeAllDistributionsOld,
  changeDistributionNew,
  changeTextBoxes,
  coefficientsToPercents,
  getDistributionNew,
  getDistributionOld,
  getDistributionVersion,
  getTextBoxes,
} from '../../../state/slices/distribution';
import { parseDistribution } from '../../../utils/usefulFunctions';

const Attribute = React.memo(AttributeRaw);
const Condition = React.memo(ConditionRaw);

const useStyles = makeStyles((theme) => ({
  textbox: {
    maxWidth: 195,
    marginBottom: theme.spacing(2),
  },
  slider: {
    margin: theme.spacing(2),
    minWidth: 200,
    [theme.breakpoints.up('sm')]: {
      marginLeft: theme.spacing(5),
    },
  },

  sliderOld: {
    marginBottom: theme.spacing(7),
    '& div': {
      '& .noUi-connects': {
        '& .noUi-connect:nth-child(1)': {
          background: '#b1b1b5 !important',
        },
        '& .noUi-connect:nth-child(2)': {
          background: '#e25822 !important',
        },
        '& .noUi-connect:nth-child(3)': {
          background: '#d2351e !important',
        },
        '& .noUi-connect:nth-child(4)': {
          background: '#48631f !important',
        },
        '& .noUi-connect:nth-child(5)': {
          background: 'orange !important',
        },
        '& .noUi-connect:nth-child(6)': {
          background: '#a25aca !important',
        },
      },
    },
  },
  sliderNew: {
    '& div': {
      '& .noUi-connects': {
        '& .noUi-connect': {
          background: '#00cccc !important',
        },
      },
    },
  },
}));

const DISTRIBUTION_NAMES = [
  { name: 'Power', min: 0, max: 6000, step: 10, color: '#b1b1b5' },
  { name: 'Burning', min: 0, max: 60, step: 0.1 },
  { name: 'Bleeding', min: 0, max: 60, step: 0.1 },
  { name: 'Poisoned', min: 0, max: 60, step: 0.1 },
  { name: 'Torment', min: 0, max: 60, step: 0.1 },
  { name: 'Confusion', min: 0, max: 60, step: 0.1 },
];

const DamageDistribution = () => {
  const classes = useStyles();

  const dispatch = useDispatch();
  const version = useSelector(getDistributionVersion);
  const distributionOld = useSelector(getDistributionOld); // actual real selected damage distribution at any time
  const distributionNew = useSelector(getDistributionNew);
  const { t } = useTranslation();

  // locally displayed in the text boxes. Text boxes might contain a string that is not a real number (yet), so we need to store those separately
  const textBoxes = useSelector(getTextBoxes);

  // eslint-disable-next-line no-unused-vars
  const onUpdateOld = (render, handle, value, un, percent) => {
    const distributionRecalc = [];
    let prev = 0;
    for (let i = 0; i < value.length; i++) {
      distributionRecalc.push(value[i] - prev);
      prev = value[i];
    }
    distributionRecalc.push(100 - prev);
    const percentDistribution = {
      Power: distributionRecalc[0],
      Burning: distributionRecalc[1],
      Bleeding: distributionRecalc[2],
      Poisoned: distributionRecalc[3],
      Torment: distributionRecalc[4],
      Confusion: distributionRecalc[5],
    };
    dispatch(changeAllDistributionsOld(percentDistribution));
  };

  const initialPercentDistribution = Object.values(coefficientsToPercents(distributionNew, true));
  const initialPercentValue = [0, 1, 2, 3, 4].map((i) => {
    let total = 0;
    for (let j = 0; j <= i; j++) {
      total += initialPercentDistribution[j];
    }
    return Math.min(total, 100);
  });

  const SliderOld = () => {
    return (
      <>
        <div className={classes.sliderWrapper}>
          <Nouislider
            className={classNames(classes.sliderOld)}
            start={initialPercentValue}
            connect={[true, true, true, true, true, true]}
            range={{
              min: [0],
              max: [100],
            }}
            step={1}
            pips={{
              mode: 'values',
              values: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
              density: 5,
            }}
            onSlide={onUpdateOld}
          />
        </div>
        <Grid container spacing={2}>
          {DISTRIBUTION_NAMES.map((dist) => (
            <Grid key={dist.name} item xs>
              <Typography style={{ whiteSpace: 'nowrap' }}>
                {dist.name === 'Power' ? (
                  <Attribute name="Power" style={{ whiteSpace: 'nowrap' }} />
                ) : (
                  <Condition name={dist.name} disableLink style={{ whiteSpace: 'nowrap' }} />
                )}{' '}
                {distributionOld[dist.name]}%
              </Typography>
            </Grid>
          ))}
        </Grid>
      </>
    );
  };

  // eslint-disable-next-line no-unused-vars
  const onUpdateNew = (key) => (render, handle, value, un, percent) => {
    dispatch(changeTextBoxes({ index: key, value: Math.round(value * 100) / 100 }));
    dispatch(changeDistributionNew({ index: key, value: Math.round(value * 100) / 100 }));
  };

  const handleChangeTextNew = (key) => (e) => {
    const { value } = e.target;
    dispatch(changeTextBoxes({ index: key, value }));

    const parsedValue = parseDistribution(value).value;
    dispatch(changeDistributionNew({ index: key, value: parsedValue }));
  };
  const SlidersNew = () => {
    return DISTRIBUTION_NAMES.map((dist, index) => (
      <Box display="flex" flexWrap="wrap" key={`distriNew_${dist.name}`}>
        <Box>
          <FormControl className={classNames(classes.margin, classes.textbox)}>
            <InputLabel htmlFor={`input-with-icon-adornment-${index}`}>
              {dist.name === 'Power' ? (
                <Attribute name="Power" text={t('Power Coefficient')} />
              ) : (
                <Condition
                  name={dist.name}
                  text={
                    // i18next-extract-mark-context-next-line ["Burning","Bleeding","Poisoned","Torment", "Confusion"]
                    t(`avgStacks`, { context: dist.name })
                  }
                />
              )}
            </InputLabel>
            <Input
              id={`input-with-icon-adornment-${index}`}
              value={textBoxes[dist.name]}
              endAdornment={
                <InputAdornment position="end">
                  {dist.name === 'Power' ? (
                    <Attribute name="Power" disableLink disableText />
                  ) : (
                    <Condition name={dist.name} disableLink disableText />
                  )}
                </InputAdornment>
              }
              error={parseDistribution(textBoxes[dist.name]).error}
              onChange={handleChangeTextNew(dist.name)}
              autoComplete="off"
            />
          </FormControl>
        </Box>
        <Box flexGrow={1}>
          <Nouislider
            className={classNames(classes.sliderNew, classes.slider)}
            start={distributionNew[dist.name]}
            connect={[true, false]}
            range={{
              min: [dist.min],
              max: [dist.max],
            }}
            step={dist.step}
            onSlide={debounce(onUpdateNew(dist.name), 50)}
          />
        </Box>
      </Box>
    ));
  };

  return version === 1 ? SliderOld() : SlidersNew();
};

export default DamageDistribution;
