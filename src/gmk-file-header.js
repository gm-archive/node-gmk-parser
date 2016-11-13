// flickr-fetcher.js
var fs = require('fs');
var util = require('util');
var Promise = require("bluebird");
var Parser = require("binary-parser").Parser;
var readFile = Promise.promisify(fs.readFile);

//
// # Parsers
//
var SkipParser = require('./parsers/SkipParser.js');
var GMKEncryption = require('./parsers/GMKEncryption.js');
var SettingsParser = require('./parsers/SettingsParser.js');

var GMFileReader;

var GMFileHeader = Parser.start()
    .endianess('little')
    .uint32('identifier', {assert: 1234321})
    .uint32('version', {assert: function(value) {
        return value===530 || value === 600 || value === 610 || value === 701 || value===800 || value===810
    }})
    .choice('encryption', {
        tag: 'version',
        choices: {
            530: SkipParser.Skipped4Bytes,
            701: GMKEncryption.GMKEncryptionHeader,
        },
        defaultChoice: SettingsParser.GameID
    })

//
// # GM game body ignoring the header
//
var GMGameBody = Parser.start()
    .endianess('little')
    .string('GameGUID',{length:16})
    .nest('GameSettings',{type:SettingsParser.GameSettings})
    .uint32('next')
    .uint32('next2')


//
// # Full unencrypted game
//
var GMGame = Parser.start()
    .endianess('little')
    .nest('GMFileHeader',{type: GMFileHeader})
    .nest('GMGameBody',{type:GMGameBody})



GMFileReader = {
    openGmFile: function(file_path) {
        return readFile(file_path).then( this.processData);
    },
    getFullByteDataFromFile: function(file_path) {
        return readFile(file_path);
    },
    //
    // # Save game to .json format
    //
    saveJSONOutput: function(full_path,game_object) {
        fs.writeFile(full_path,JSON.stringify(game_object,null,2));
        return true;
    },
    processData: function(data) {
        var game_header = GMFileHeader.parse(data);
        if (GMFileReader.isObfuscated(game_header)) {
            var unencrypted_data = GMKEncryption.unencryptFullGame(game_header,data);
            return GMFileReader.processUnEncryptedGame(unencrypted_data);
        }
        return GMFileReader.processUnEncryptedGame(data);
    },
    processUnEncryptedGame: function(data) {
        GMGame.zlib=require('zlib')
        GMGame.MainSettings = SettingsParser.MainSettings;
        var parsed_gm_file = GMGame.parse(data);
        // console.error("GM File:",parsed_gm_file.GMFileHeader.version,parsed_gm_file);
        return parsed_gm_file;
    },
    isObfuscated: function(parsed_gm_file) {
        if (parsed_gm_file.encryption.seed)
            return true;
        return false;
    }
};

module.exports = GMFileReader;