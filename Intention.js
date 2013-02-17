(function () {

    'use strict';

    var intentionWrapper = function($, ctx){
      var Intention = function(params){
        
        if(params){
          for(var param in params){
            if(params.hasOwnProperty(param)){
              this[param] = params[param];  
            }
          }
        }
        
        this.context = new ctx(this.thresholds);

        this._listeners = {};
        
        // by default the container is the document
        this.setElms(this.container);  
                
        // this part of initialization allows me to externalize the
        // messiness of a regex to arrays that are stored as props of 
        // the intention object. abstraction for clarity, or regexes are
        // regexes
        this._setStaticPatterns();

        var intentHandler = this._hitch(this, function(info){
          this.info=info;
          this.filters = this._makeFilterPatterns(info);

          // set the context information to the info (event object that comes from context)
          this.intend();
        });
        
        // run the intention on initialization to setup any elms that need setting
        intentHandler(this.context.info());

        this.context.on('change', intentHandler);
        
        return this;

      };

      Intention.prototype = {

        // public props
        container: document,
        elms:$(),
        _contexts: [],
        // privates
        _funcs: [
          // the only(?) multi-val attr
          'class', 
          // placement attrs
          'append', 'prepend', 'before', 'after',
          // single val attrs
          'src',
          'href',
          'height',
          'width',
          'title',
          'tabindex',
          'id',
          'style',
          'align',
          'dir',
          'contenteditable',
          'lang',
          'xml:lang',
          'accesskey',
          'background',
          'bgcolor',
          'contextmenu',
          'draggable',
          'hidden',
          'item',
          'itemprop',
          'spellcheck',
          'subject',
          'valign'],

        _placements:['before', 'after', 'prepend', 'append'],

        _staticPatterns: {},

        _setStaticPatterns: function(){

          var patterns = ['funcs', 'placements'];

          for(var i=0; i<patterns.length; i++){
            this._staticPatterns[patterns[i]] = 
              this._listToPattern(this['_' + patterns[i]])
          }

        },

        _listToPattern: function(list){

          // this function takes the above list and converts it into a pattern
          // for use with the intentional attrs
          var pattern='';

          for(var i=0; i<list.length; i++) {
            pattern+= list[i] + '|'; 
          }

          return pattern.replace(/\|$/, '');

        },

        _makeInstructions: function(elm){
          
          var attrs=elm.attributes,
            instructions={},
            interaction=this.info.interaction,
            context=this.info.name;

          
          for(var i=0; i<attrs.length;i++){

            var attr = attrs[i];

            // if the attr is not the current interaction mode, try the next one
            if(this.filters.interaction.test(attr.name)){
              continue;
            }
            
            if(this.filters.context.test(attr.name)){
              // at this point we have a hold on a data attrs that is not of the 
              // current context it may be a base data attr a context attr
              // or a data attr that we are not interested in
              var funcMatch = attr.name.match(this.filters.func);

              if(funcMatch){

                var func = funcMatch[0];

                if(!instructions[func]){

                  instructions[func] = {
                    options:[attr]
                  }

                } else {

                  instructions[func].options.push(attr);

                }
              }
            }
          }
          return instructions;

        },

        _makeFilterPatterns: function(context){

          // to keep things clear for myself and for those that may look at this code
          // i am breaking the task of matching relevant attrs into two regexes
          // this also gives the added benefit of allowing me on the second pass
          // to extract the function string and create the instruction object right there
          var notContexts = '',
            notInteractions = '';
          // looking for the context or the interaction or the function NO ORDER
          
          // TODO: ficks
          // build the context filter for the regex
          var thresholds=this.context._thresholds;

          for(var i=0; i<thresholds.length;i++) {
            if(thresholds[i].name !== context.name){
              notContexts+='(' + thresholds[i].name + ')|'  
            }
          }

          for(var i=0; i<this.context.interactionModes.length;i++) {
            
            if(this.context.interactionModes[i] !== 
                context.interaction){
              notInteractions+='(' + this.context.interactionModes[i] + ')|'  
            }
          }

          notInteractions = notInteractions.replace(/\|$/, '');

          notContexts = notContexts.replace(/\|$/, '');

          // these patterns should not be generated for every element,
            // they happen on a per "change" basis

          // pattern is a reverse lookback meaning: match anything that is not [string]
          var patterns = { 
            context: new RegExp('^data-((?!'+ notContexts +').)*$'),
            func: new RegExp(this._staticPatterns.funcs),

            // find the interaction mode we're not in
            // do a reverse lookback regex
            interaction: new RegExp(notInteractions)
          };

          return patterns;

        },

        _findBest: function(func, options){

          // perhaps there's a more efficient way of doing this but naively this seems to work

          // context[mobile] +4, interaction[touch] +2, subfunction[append] +3

          var contextPattern = '';

          for(var i=0; i<this.context._thresholds.length;i++) {
            contextPattern += this.context._thresholds[i].name + '|';
          }

          contextPattern = contextPattern.replace(/\|$/, '');
          
          var points = [
            {pattern:contextPattern, value:4}, 
            // for the foreseeable future there are not going to be any interaction modes
            // other than touch and mouse, but a dynamic pattern to come from context is in order
            {pattern: 'touch|mouse', value:2}, 
            {pattern: func + '-[a-zA-Z\-\_]+$', value:3}]

          // search for string, apply rank
          var best,
            lastRank=0;

          for(var i=0; i<options.length; i++) {

            var rank=1;

            for(var j=0; j<points.length; j++){
              if(new RegExp(points[j].pattern).test(options[i].name)){
                rank+=points[j].value;
              }
            }

            if(rank > lastRank){
              best=options[i];
              lastRank=rank;
            }
          }

          return best;
          
        },

        _combine:function(options){

          // take the base and make it into an array
          // a.split(' ')
          // a =union(a,b);
          // a.toString();
          // a.replace(/,/g, ' ')

          var values = [];

          for(var i=0; i<options.length; i++){
            values=this._union(values, options[i].value.split(' '))
          }

          values = values.toString();

          values = values.replace(/,/g, ' ');

          return values;

        },

        _class:function(elm, instruction){

          $(elm).attr('class', this._combine(instruction.options));

          return;
        },


        _attr: function(elm, instruction) {

          var attrs = this._divideAttrs(instruction.options);

          for(var attr in attrs){
            if(attrs.hasOwnProperty(attr) ){
              var attrVal = this._findBest('attr', attrs[attr]).value;
              $(elm).attr(attr, attrVal);
            }
          }

          return;

        },

        _move: function(elm, instruction) {

          // find the base
          var choice = this._findBest('move', instruction.options),
            moveSelector = choice.value;

          var placementSpec = choice.name.match(new RegExp('move-('+ 
                this._staticPatterns.placements + '$)'));

          if(placementSpec){
            $(moveSelector)[placementSpec[1]]( elm );
          } else {
            $(moveSelector).append( elm );
          }

        },

        _divideAttrs: function(options){

          var attrs = {};

          for(var i=0, l=options.length; i<l; i++){

            // find the specific attr we are manipulating

            // until we come up with a more intelligent algo, i'm just going to
            // take everything after the "func" hence the regex below          

            // this line is ready for some articulation
            var attrName = options[i]
                  .name.match(new RegExp('attr' + '-('+ this._staticPatterns.attrs +'$)'))[1];

            if(attrs[attrName]) {
              attrs[attrName].push(options[i])
            } else {
              attrs[attrName] = [options[i]];
            }
          }

          return attrs;
      
        },

        _hitch: function(scope,fn){
            return function(){
              return fn.apply(scope, arguments); 
            };
        },

        // this supports the base attr functionality
        _union: function(x,y) {

          var obj = {};

          for (var i=x.length-1; i >= 0; --i) {
            obj[x[i]] = x[i];
          }
          for (var i=y.length-1; i >= 0; --i){
            obj[y[i]] = y[i];
          }
           
          var res = [];

          for (var k in obj) {
            if (obj.hasOwnProperty(k)){
              res.push(obj[k]); // <-- optional
            }  
          }
          return res;
        },

        _isEmpty: function(obj){
          for(var prop in obj) {
            if(obj.hasOwnProperty(prop)){ return false; }
          }
          return true;
        },

        // get all the keys in an object
        _keys: function(obj){
          var keys=[];
          for(var k in obj){
            if(obj.hasOwnProperty(k)) keys.push(k);
          }
          return keys;
        },

        _emitter: function(event){
          if(typeof event === 'string') {
            event={type:event};
          }

          if(!event.target){
            event.target=this;
          }

          if(!event.type){
            throw new Error(event.type + ' is not a supported event.');
          }

          if($.isArray(this._listeners[event.type])){
            var listeners = this._listeners[event.type];
            for(var i=0; i<listeners.length; i++){
              listeners[i].call(this, event);
            }
          }

        },

        // public methods
        // code and concept taken from simple implementation of observer pattern outlined here:
        // http://www.nczonline.net/blog/2010/03/09/custom-events-in-javascript/
        on: function(type, listener){
          if(typeof this._listeners[type] === 'undefined') {
            this._listeners[type]=[];
          }
          this._listeners[type].push(listener)
        },

        off: function(type, listener){
          if($.isArray(this._listeners[type])){
            var listeners = this._listeners[type];
            for(var i=0;listeners.length; i++){
              if(listeners[i] === listener){
                listeners.splice(i,1);
                break;
              }
            }
          }
        },


        intend: function(){
          
          // go through all of the elms
          this.elms.each(this._hitch(this, function(i, elm){
            var instructions = this._makeInstructions(elm);

            if(this._isEmpty(instructions)) return;

            $.each(instructions, this._hitch(this, 
              function(instructionName, instruction){
                this['_' + instructionName](elm, instruction);
              }));

          }));


          return this;
        },

        setElms: function(scope){
          // find all responsive elms in a specific dom scope
          if(!scope) var scope = document;
          this.elms = $('[data-intention],[intention],[data-tn],[tn]', scope);
          return this;
        },

        add: function(elms){
          // is expecting a jquery object

          var respElms=this.elms;

          elms.each(function(){
            respElms.push(this);
          });
          
          return this;
        },

        remove: function(elms){
          // is expecting a jquery object

          var respElms = this.elms;
          // elms to remove
          elms.each(function(i, elm){
            // elms to check against
            respElms.each(function(i, candidate){
              if(elm === candidate){
                respElms.splice(i, 1);
                // found the match, break the loop
                return false;
              }
            });
          });

          return this;
        },

        _respond: function(contexts){

          // TODO: currentContexts could be passed
          var funcs = this._funcs,
            resolutions = {};

          var resolveAttr = function(attr, funcs, resolutions){
            // go through the possible functions
            $.each(funcs, function(i, func){

              // check to see if there's a resolution on the attr's func
              if(resolutions[func]){
                // if the function is already resolved continue
                // to the next func
                return;
              }

              // test the attr name, is it relevant
              if(new RegExp('(^tn-|^intention-|^data-tn-|^data-intention-)?' +
                + ctx.name + '-' + func + '$').test(attr.name)) {
                // there is an appropriate match


                if(func === 'class'){ 
                  // class gets resolved uniquely because it is a multi-
                  // value attr
                  if(resolutions.class === undefined) {
                    resolutions.class=[]
                  }

                } else {
                  // resolve the function to prevent further checks
                  resolutions[func]=true;
                }

              }

            });

            return resolutions;
          };

          // go through all of the responsive elms
          this.elms.each(function(i, elm){
            var attrs = elm.attributes;

            // go through currentCtxs (ordered by priority) TODO:
            $.each(contexts, function(i, ctx){

              // go through the elements attrs
              $.each(attrs, function(i, attr){
                // if the attr does not match the current context
                // move on
                console.log(ctx, attr);

              });
            });
          });


        }, 

        responsive:function(contexts, measure, matcher){

          // todo: switch order of matcher and measure
          // i could get rid of the name if i bound all events to 
          // the object returned by this function
          // hypothetical: (contexts, matcher, measure)
          // responder.on('contextName', func)
          // responder.on('change', func) ??

          var contextList = this._contexts, 
            currentContext,
            emitter = this._hitch(this, this._emitter);

          // bind an the _respond function to each context name
          $.each(contexts, this._hitch(this, function(i, ctx){
            this.on(ctx.name, this._hitch(this,
                function(){this._respond(contextList);}));
          }));

          return function(){
            // TODO: info is a bad name
            var info,
              contextualize = function(newContext){

                var removeCtx = function(contexts, irrCtx){
                  $.each(contexts, function(i, ctx){
                    if(irrCtx.name === ctx.name) {
                      contexts.splice(i, 1);
                      return false;
                    }
                  });
                  return contexts;
                };

                // remove other contexts in the group from the list
                $.each(contexts, function(i, ctx){
                  if( newContext.name !== ctx.name ){
                    removeCtx(contextList, ctx);
                  }
                });
                
                return newContext;
              };

            // if there is no measure
            if($.isFunction(measure) === false) {
              if(arguments.length) {
                info = arguments[0];
              } 
            } else {
              // the measure will return a val to compare to each
              // context that was passed, if no matcher function
              // is specified it should return the name of the context
              info = measure.apply(this, arguments);
            }

            $.each(contexts, function(i, ctx){

              if($.isFunction(matcher)) {
                
                if( matcher(info, ctx)) {
                  // first time, or different than last context
                  if( (currentContext===undefined) || 
                    (ctx.name !== currentContext.name)){

                    currentContext = contextualize(ctx);
                    // break the loop
                    return false;
                  }
                  // same context, break the loop
                  return false;
                }
                
              } else {
                // there's no matcher fall back to direct test
                if(info !== ctx.name ) {
                  currentContext = contextualize({name:info});
                  // break the loop
                  return false;
                }
              }
            });
            
            emitter($.extend({},{type:currentContext.name}, currentContext));

            // return the current context
            return currentContext;
          }
        }
      };
      return Intention;
    };

    if ( typeof define === "function" && define.amd ) {
      define( ['jquery', 'Context'], intentionWrapper );
    } else {
      if(!window.jQuery) {
        throw('jQuery is not defined!!');
      } else if (!window.Context){
        throw('Context is not defined!!');
      }
      window.Intention = intentionWrapper(jQuery, Context);
    }

})();
