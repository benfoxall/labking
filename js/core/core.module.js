'use strict';
require('ui.router');

require('../blocks/exception/exception.module');
require('../blocks/logger/logger.module');
require('../blocks/router/router.module');

var config = require('./config');

var moduleName = 'labking.core';

require('angular')
  .module(moduleName, [
      'blocks.exception', 'blocks.logger', 'blocks.router',
      'ui.router'
  ])
  //.constant('toastr', toastr)
  // .constant('moment', moment)
  .value('config', config.config)
  //.config(config.configure)
  //.config(config.toastrConfig)
  .factory('CohortService', require('./cohort.service'))
  .factory('DatasetMetadataService', require('./datasetmetadata.service'))
  .factory('ParticipantService', require('./participant.service'))
  .factory('ParticipantKeyInfoService', require('./participantKeyInfo.service'))
;

module.exports = moduleName;
