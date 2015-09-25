'use strict';

const LABKEY_DATE_FORMAT = 'YYYY/MM/DD hh:mm:ss';

var _ = require('lodash'),
    moment = require('moment');

/** @ngInject **/
function ParticipantService(config, DatasetMetadataService, $q, logger, $rootScope, LabKey) {

  // Caching the queries reduces server load
  // and makes the UI more responsive
  var resultsCache = {
    participants: {},
    participantKeyInfo: {}
  };

  return {
    getParticipantKeyInfo: getParticipantKeyInfo,
    getParticipantRecord: getParticipantRecord,
    getParticipantList: getParticipantList,
    createRecord: createRecord,
    updateRecord: updateRecord,
    removeRecord: removeRecord,
    generateID: generateID
  };

  function generateID() {
    return $q.when(LabKey.getParticipants([config.subjectNoun]))
      .then(function (response) {

        // flatten down to an array of IDs
        var ids = response.rows.map(function (row) {
          return row[config.subjectNoun];
        });

        // filter out IDs which don't match our format
        ids = _.filter(ids, function (participantId) {
          return config.subjectIdRegex.test(participantId);
        });

        ids.sort();

        var latestIdSuffix = Number(config.subjectIdRegex.exec(ids[ids.length - 1])[1]);

        return config.subjectIdPrefix + zeroPad(latestIdSuffix + 1, config.subjectIdZeroPadding);
      })
      .catch(fail);
  }

  // from http://stackoverflow.com/a/1268377/384693
  function zeroPad (num, numZeros) {
    var an = Math.abs(num);
    var digitCount = 1 + Math.floor(Math.log(an) / Math.LN10);
    if (digitCount >= numZeros) {
        return num;
    }
    var zeroString = Math.pow( 10, numZeros - digitCount ).toString().substr(1);
    return num < 0 ? '-' + zeroString + an : zeroString + an;
  }

  function getParticipantList(useCache=true) {
    var getFromCacheIfPossible;
    if(resultsCache.participantList && useCache){
      getFromCacheIfPossible = $q.when();
    }else{
      getFromCacheIfPossible = $q.when(LabKey.getParticipants())
        .then(updateParticipantListCache);
    }

    return getFromCacheIfPossible
      .then(function(){ return resultsCache.participantList; })
      .catch(fail);

    function updateParticipantListCache(response){
      var deferred = $q.defer();
      resultsCache.participantList = response.rows;
      deferred.resolve();
      return deferred.promise;
    }
  }


  function getParticipantKeyInfo() {
    var getFromCacheIfPossible;
    if(resultsCache[config.demographicDataset]){
      getFromCacheIfPossible = $q.when();
    }else{
      getFromCacheIfPossible = $q.when(LabKey.getDataSet(config.demographicDataset))
        .then(updateParticipantKeyInfoCache);
    }

    return getFromCacheIfPossible
      .then(function(){ return resultsCache.participantKeyInfo; })
      .catch(fail);

    function updateParticipantKeyInfoCache(response){
      var deferred = $q.defer();
      response.rows.forEach(function(record) {
        resultsCache.participantKeyInfo[record[config.subjectNoun]] = record;
      });
      deferred.resolve();
      return deferred.promise;
    }
  }


  function getParticipantRecord(participantId) {
    var getFromCacheIfPossible;
    if(resultsCache.participants[participantId]){
      getFromCacheIfPossible = $q.when();
    }else{
      getFromCacheIfPossible = $q.when(LabKey.getDataSets())
        .then(getDataSetsForParticipant)
        .then(updateParticipantCache);
    }

    return getFromCacheIfPossible
      .then(function(){ return resultsCache.participants[participantId]; })
      .catch(fail);

    function getDataSetsForParticipant(response) {
        var participantDataSetPromises = response.rows.map((dataSet) => $q.when(LabKey.getParticipantDataSet(config.subjectNoun, participantId, dataSet.Name)));
        return $q.all(participantDataSetPromises);
    }

    function updateParticipantCache(responsesArray){
      var dataSets = {};
      responsesArray.forEach((response) => {
        dataSets[response.queryName] = response;
        // Push the columnModel so we can cache the metadata
        DatasetMetadataService.cacheColumnModel(response.queryName, response.columnModel);
      });

      resultsCache.participants[participantId] = { dataSets: dataSets };
      resultsCache.participants[participantId][config.subjectNoun] = participantId;
    }
  }

  function createRecord(dataSetName, record) {
    var serialisedRecord = _.cloneDeep(record);
    if(serialisedRecord.date){
      serialisedRecord.date = moment(serialisedRecord.date).format(LABKEY_DATE_FORMAT);
    }

    _.forOwn(serialisedRecord, function(value, key){
      if(value instanceof Date){
        serialisedRecord[key] = moment(value).format(LABKEY_DATE_FORMAT);
      }
    });

    return $q.all([DatasetMetadataService.getMetaData(), LabKey.insertRow(dataSetName, serialisedRecord)])
      .then(function(responses) {
        var [metadata, response] = responses;
        var participantId = response.rows[0][config.subjectNoun];

        resultsCache.participantList.push(response.rows[0]);

        if(resultsCache.participants[participantId] === undefined){
          resultsCache.participants[participantId] = { dataSets: {} };
          resultsCache.participants[participantId][config.subjectNoun] = participantId;
        }

        if(resultsCache.participants[participantId].dataSets[dataSetName] === undefined){
          resultsCache.participants[participantId].dataSets[dataSetName] = {
            rows: []
          };
        }

        var datasetMetadata = metadata[dataSetName].columns;
        var returnedRecords = response.rows.map(function(row) {
          return LabKey.coerceToType(row, datasetMetadata, 'Name');
        });

        Array.prototype.push.apply(resultsCache.participants[participantId].dataSets[dataSetName].rows, returnedRecords);

        logger.success('Record created');
        $rootScope.$broadcast('labkey:record:created', resultsCache.participants[participantId]);
        return $q.when();
      })
      .catch(function(errors){
        logger.error(errors.exception, 'Save failed');
        return $q.reject(errors);
      });
  }

  function updateRecord(dataSetName, record) {
    var serialisedRecord = _.cloneDeep(record);

    serialisedRecord.date = moment(serialisedRecord.date).format(LABKEY_DATE_FORMAT);
    _.forOwn(serialisedRecord, function(value, key){
      if(value instanceof Date){
        serialisedRecord[key] = moment(value).format(LABKEY_DATE_FORMAT);
      }
    });

    return $q.when(LabKey.updateDataSetRow(dataSetName, serialisedRecord))
      .then(function(response) {
        var participantId = response.rows[0][config.subjectNoun];
        var dataset = resultsCache.participants[participantId].dataSets[dataSetName].rows;

        var i = _.findIndex(dataset, { 'lsid': record.lsid});
        dataset[i] = record;

        $rootScope.$broadcast('labkey:record:updated', resultsCache.participants[participantId]);
        logger.success('Record updated');
        return $q.when();
      })
      .catch(function(errors){
        logger.error(errors.exception, 'Save failed');
        return $q.reject(errors);
      });
  }

  function removeRecord(dataSetName, record) {
    return $q.when(LabKey.removeDataSetRow(dataSetName, record))
      .then(function () {
        var dataset = resultsCache.participants[record[config.subjectNoun]].dataSets[dataSetName].rows;
        var i = _.findIndex(dataset, { 'lsid': record.lsid});
        dataset.splice(i, 1);
        $rootScope.$broadcast('labkey:record:removed', record[config.subjectNoun]);
      })
      .catch(function(errors){
        logger.error(errors.exception, 'Delete failed');
        return $q.reject(errors);
      });

  }

  function fail(error) {
    var msg = 'query failed. ';
    if(error.data !== undefined){
      msg = msg + error.data.description;
    }
    logger.error(msg);
    return $q.reject(msg);
  }
}

module.exports = ParticipantService;
