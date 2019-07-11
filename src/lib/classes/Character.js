import * as fs from 'fs';

import * as _ from 'lodash';

import { log, error } from '../log';
import { System, ready as systemsReady, getSystem } from './System';
import { Document } from './Document';
import { LoadQueue } from './LoadQueue';

import { zoneCompose } from '../compose';
import { applyContext } from '../context';
import { toDataURL } from '../data';
import { toKebabCase, toCamelCase, toPathCase, toSpaceCase, toTitleCase } from '../util';

function parseCharacter(chardesc) {
  // attributes
  let attr = Object.assign({
    name: false,
    game: 'pathfinder2',
    theme: 'pathfinder',
    language: 'en',

    ancestry: false,
    heritage: false,
    background: false,
    class: false,

    printColour: '#707070',
    accentColour: '#707070',
    printLogo: false,
    printPortrait: false,
    animalPortrait: false,
    printBackground: false
  }, chardesc.attributes);

  // an object to start with
  let char = {
    name: attr.name,
    game: attr.game,
    units: ['core', 'base', 'theme/'+attr.theme],
    language: attr.language,
    options: {
      'animal-companion': false,
      'party-funds': false,
      'permission': false,
      'build': false,
      'mini': false,
      'spellbook': false
    },
    spellbookStyle: 'normal',
    miniSize: 'medium',
    printColour: attr.printColour,
    accentColour: attr.accentColour,
    printLogo: attr.printLogo,
    favicon: 'favicon16.png',
    printPortrait: attr.printPortrait,
    animalPortrait: attr.animalPortrait,
    printBackground: attr.printBackground,
  };

  // get all the flags
  Object.keys(attr).forEach(key => {
    if (key.match(/^option/)) {
      let flag = key.replace(/^option/, '').toLowerCase();
      // log("Character", "Option", flag, attr[key]);
      let ok = char.options[flag] = !!attr[key];
      if (ok)
        char.units.push('option/'+flag);
    }
  });

  // game-specific settings
  switch(attr.game) {
    case 'pathfinder2':
      if (attr.ancestry) {
        char.units.push('ancestry/'+attr.ancestry.replace(/^ancestry-/, ''));
        char.ancestry = attr.ancestry.replace(/^ancestry-/, '');
      }

      if (attr.heritage)
        char.units.push('heritage/'+attr.heritage.replace(/^heritage-/, ''));

      if (attr.ancestryFeats) {
        char.ancestryFeats = parseFeats(attr.ancestryFeats);
      }

      if (attr.background)
        char.units.push('background/'+attr.background.replace(/^background-/, ''));

      if (attr.class) {
        char.units.push('class/'+attr.class.replace(/^class-/, ''));
        char.class = attr.class.replace(/^class-/, '');
        let cls = toCamelCase('class '+char.class);
        
        let classFeatsKey = cls+'Feats';
        if (attr[classFeatsKey]) {
          char.classFeats = parseFeats(attr[classFeatsKey]);
        }

        Object.keys(attr).forEach(key => {
          // log("Character", key);
          // let value = attr[key];
  
          if (key.startsWith(cls) && !key.endsWith('Feats')) {
            let selname = key.replace(cls, '');
            // log("Character", "Class option", key, selname, attr[key]);
            char.units.push('select/'+char.class+'/'+toKebabCase(selname)+'/'+toKebabCase(attr[key]));
          }
        });
      }

      if (attr.feats) {
        char.feats = parseFeats(attr.feats);
      }

      if (attr.skillFeats) {
        char.skillFeats = parseFeats(attr.skillFeats);
      }

      break;
  }

  log("Character", "Parsed", char);
  return char;
}

function parseFeats(feats) {
  return feats;
}


export class Character {
	constructor(chardesc, registry) {
        this.registry = registry;
        this.chardesc = parseCharacter(chardesc);
    }

    create(callback) {
        var self = this;
        log("Character", "Create character");

        log("Character", `Name: ${this.chardesc.name}, game: ${this.chardesc.game}`);
        log("Character", `Units: ${this.chardesc.units}`);

        systemsReady(() => {
            try {
                var system = getSystem(this.chardesc.game);
                if (system === null) {
                    error("Character", "System not found:", this.chardesc.game);
                    return;
                }

                // start with a document
                var documentUnit = system.getUnit("document");
                var document = new Document(documentUnit);

                var title = `${toTitleCase(this.chardesc.ancestry)} ${toTitleCase(this.chardesc.class)}`;
                if (this.chardesc.name) {
                  title = `${this.chardesc.name}, ${title}`;
                }
                document.title = title;

                // Load assets
                var loadQueue = new LoadQueue();
                if (this.chardesc.favicon) {
                    loadQueue.loadEmbed(__dirname+'/assets/'+this.chardesc.favicon).then(data => {
                        document.faviconURL = toDataURL(data, this.chardesc.favicon);
                    });
                }

                if (this.chardesc.printLogo) {
                    loadQueue.loadEmbed(__dirname+'/assets/'+this.chardesc.printLogo).then(data => {
                        document.logoURL = toDataURL(data, this.chardesc.printLogo);
                    })
                }

                if (this.chardesc.printPortrait) {
                    loadQueue.loadEmbed(__dirname+'/assets/'+this.chardesc.printPortrait).then(data => {
                        document.portraitURL = toDataURL(data, this.chardesc.printPortrait);
                    });
                }

                if (this.chardesc.animalPortrait) {
                    loadQueue.loadEmbed(__dirname+'/assets/'+this.chardesc.animalPortrait).then(data => {
                        document.animalURL = toDataURL(data, this.chardesc.animalPortrait);
                    });
                }

                if (this.chardesc.printBackground) {
                    loadQueue.loadEmbed(__dirname+'/assets/'+this.chardesc.printBackground).then(data => {
                        document.backgroundURL = toDataURL(data, this.chardesc.printBackground);
                    });
                }

                // TODO set character parameters
                document.printColour = this.chardesc.printColour;
                document.accentColour = this.chardesc.accentColour;

                // load units
                var units = system.getUnits(self.chardesc.units);

                // required units
                units.forEach(unit => {
                  if (unit.hasOwnProperty("require")) {
                    log("Character", `Unit ${unit.name} requires`, unit.require);
                    unit.require.forEach(req => {

                    });
                  }
                });

                // infer units

                // make the element tree
                units.forEach(unit => document.addUnit(unit));
                document.composeDocument(this.registry);

                loadQueue.ready(() => {
                    log("Character", "Ready");
                    // write the document out for debug
                    fs.writeFile(__dirname+'/../test/test.json', JSON.stringify(document.doc, null, 2), (err) => {
                        if (err)
                            error("Character", "Could not write JSON file:", err);
                    });

                    // render the document
                    var data = document.renderDocument(this.registry);

                    callback(data);
                });
            } catch (err) {
                error("Character", "Error:", err);
            }
        })
    }
}