"use strict";

var fs = require('fs');

// CHANGED
var wpi = require('node-wiring-pi');
wpi.wiringPiSetupGpio();
wpi.softPwmCreate(21, 0, 100);



var Service, Characteristic;
var temperatureService;

// CHANGED
var fanService;
var fanManualControlService;

module.exports = function (homebridge)
  {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-pi", "PiTemperature", PiTemperatureAccessory);
  }

function PiTemperatureAccessory(log, config)
  {
  this.log = log;
  this.name = config['name'];
  this.lastupdate = 0;
  this.fanSpeed = 0;
  this.monitorTempInterval = null;
  this.maxMonitorTemp = 45;
  }

PiTemperatureAccessory.prototype =
  {
  getState: function (callback)
    {
    // Only fetch new data once per minute
    if (this.lastupdate + 60 < (Date.now() / 1000 | 0))
      {
      var data = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      if (typeof data == 'undefined') { return this.log("Failed to read temperature file"); }
      this.temperature = (0.0+parseInt(data))/1000;
      }
    this.log("Raspberry Pi CPU/GPU temperature at " + this.temperature);
    temperatureService.setCharacteristic(Characteristic.CurrentTemperature, this.temperature);
    callback(null, this.temperature);
    },

  identify: function (callback)
    {
    this.log("Identify requested!");
    callback(); // success
    },

  // CHANGED

  getManualControlState: function(cb)
    {
      cb(null, this.monitorTempInterval != null);
    },

  setManualControlState: function(state, cb)
    {
      if (state) this.startMonitorTemp();
      else this.stopMonitorTemp();
      cb(null, this.monitorTempInterval != null);
    },

  setFanSpeed: function(fanSpeed)
    {
      this.fanSpeed = fanSpeed;
      //var speed = parseInt((fanDutyCycle / 255) * 100);
      this.log("Raspberry Pi Fan speed " + this.fanSpeed);
      //fanGpio.pwmWrite(fanDutyCycle);
      wpi.softPwmWrite(21, this.fanSpeed);
    },

  getFanOn: function(cb)
    {
      const on = this.fanSpeed > 0;
      cb(null, on);
    },

  setFanOn: function (on, cb)
    {
      if (on && this.fanSpeed == 0) {
        this.setFanSpeed(100);
      } else if (!on) {
        this.setFanSpeed(0);
      }
      cb(null, on);
    },

  getFanRotationSpeed:function (cb)
    {
      cb(null, this.fanSpeed);
    },

  setFanRotationSpeed:function (speed, cb)
    {
      // speed given is a number 100 (full power) to 0
      //console.log('setRotationSpeed',speed);
      // scale speed by duty cycle
      //if (this.dutycycle < this.min_dutycycle) this.dutycycle = this.min_dutycycle; // clamp to minimum TODO: return error to user if can't go this low?
      //console.log('dutycycle',this.dutycycle);
      this.setFanSpeed(speed);
      cb(null);
    },





  getServices: function ()
    {
    var informationService = new Service.AccessoryInformation();

    var data = fs.readFileSync('/proc/cpuinfo', 'utf8');
    if (typeof data == 'undefined') { return this.log("Failed to read /proc/cpuinfo"); }
    var model = data.match(/Hardware\s+\:\s*(\S+)/)[1] + "/" + data.match(/Revision\s+\:\s*(\S+)/)[1];
    var serial = data.match(/Serial\s+\:\s*(\S+)/)[1];
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Raspberry")
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, serial);
    this.log("Model " + model + " Serial " + serial);

    temperatureService = new Service.TemperatureSensor(this.name);
    temperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getState.bind(this));

    temperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({minValue: -30});
        
    temperatureService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({maxValue: 120});




    // CHANGED
    fanManualControlService = new Service.Switch(this.name);
    fanManualControlService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getManualControlState.bind(this))
      .on('set', this.setManualControlState.bind(this));

    fanService = new Service.Fan(this.name);
    fanService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getFanOn.bind(this))
      .on('set', this.setFanOn.bind(this));
    fanService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getFanRotationSpeed.bind(this))
      .on('set', this.setFanRotationSpeed.bind(this));

    return [informationService, temperatureService, fanService, fanManualControlService];
    },

    stopMonitorTemp: function() {
      clearInterval(this.monitorTempInterval);
      this.monitorTempInterval = null;
    },

    startMonitorTemp: function() {
      var self = this;
      this.monitorTempInterval = setInterval(function() {
        self.monitorTemp();
      }, 30 * 1000);
    },

    monitorTemp: function () {
      this.getState(function(){});
      if (this.temperature > this.maxMonitorTemp) {
        var diff = Math.ceil(this.temperature + 2 - this.maxMonitorTemp);
        var variableFanSpeed = Math.min(diff * 10, 100)
        this.setFanSpeed(variableFanSpeed);
        fanService.getCharacteristic(Characteristic.On).updateValue(true);
        fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.fanSpeed);
      } else {
        this.setFanSpeed(0);
        fanService.getCharacteristic(Characteristic.On).updateValue(false);
      }

    }

  };

if (!Date.now)
  {
  Date.now = function() { return new Date().getTime(); }
  }
