"use strict";

var fs = require('fs');

// CHANGED
//var Gpio = require('pigpio').Gpio,
//    fanDutyCycle = 0,
//    fanGpio = new Gpio(21, {mode: Gpio.OUTPUT});

var fanDutyCycle = 0;
var wpi = require('node-wiring-pi');
wpi.wiringPiSetupGpio();
wpi.softPwmCreate(21, 0, 100);



var Service, Characteristic;
var temperatureService;

// CHANGED
var fanService;

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
  setFanDutyCycle: function()
    {
      var speed = (fanDutyCycle / 255) * 100;
      this.log("Raspberry Pi Fan speed " + speed);
      //fanGpio.pwmWrite(fanDutyCycle);
      wpi.softPwmWrite(21, speed);
    },

  getFanOn: function(cb)
    {
      const on = fanDutyCycle > 0;
      cb(null, on);
    },

  setFanOn: function (on, cb)
    {
      if (on) {
        fanDutyCycle = 255;
      } else {
        fanDutyCycle = 0; // 0% duty cycle to turn off
      }
      this.setFanDutyCycle();
      cb(null, on);
    },

  getFanRotationSpeed:function (cb)
    {
      cb(null, (fanDutyCycle / 255) * 100);
    },

  setFanRotationSpeed:function (speed, cb)
    {
      // speed given is a number 100 (full power) to 0
      //console.log('setRotationSpeed',speed);
      // scale speed by duty cycle
      fanDutyCycle = 0|(speed / 100 * 255);
      //if (this.dutycycle < this.min_dutycycle) this.dutycycle = this.min_dutycycle; // clamp to minimum TODO: return error to user if can't go this low?
      //console.log('dutycycle',this.dutycycle);
      this.setFanDutyCycle()
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
    fanService = new Service.Fan(this.name);
    fanService.fan
      .getCharacteristic(Characteristic.On)
      .on('get', this.getFanOn.bind(this))
      .on('set', this.setFanOn.bind(this));
    fanService.fan
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getFanRotationSpeed.bind(this))
      .on('set', this.setFanRotationSpeed.bind(this));

    return [informationService, temperatureService, fanService];
    }
  };

if (!Date.now)
  {
  Date.now = function() { return new Date().getTime(); }
  }
