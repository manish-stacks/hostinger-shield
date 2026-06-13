// Central re-export — import from this file exactly as before:
//   const { User, Website, ThreatLog } = require('./models');

module.exports = {
  User:            require('./User'),
  HostingerAccount: require('./HostingerAccount'),
  Website:         require('./Website'),
  WebsiteHealth:   require('./WebsiteHealth'),
  ThreatLog:       require('./ThreatLog'),
  SSLLog:          require('./SSLLog'),
  DNSLog:          require('./DNSLog'),
  ScreenshotLog:   require('./ScreenshotLog'),
  IncidentLog:     require('./IncidentLog'),
  RestoreLog:      require('./RestoreLog'),
  Notification:    require('./Notification'),
  Report:          require('./Report'),
  BackupRecord:    require('./BackupRecord'),
};
