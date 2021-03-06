var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var TeamChallenge = mongoose.model('TeamChallenge');
var Team = mongoose.model('Team');
var MailerService = require('../../services/MailerService');
var ChallengeService = require('../../services/ChallengeService');
var TeamChallengeService = require('../../services/TeamChallengeService');

/**
 * Issue new challenge.
 * @param: challengerId
 * @param: challengeeId
 */
router.post('/', function(req, res, next) {
	var challengerId = req.body.challengerId;
	var challengeeId = req.body.challengeeId;
	
	if (!challengerId || !challengeeId) return next(new Error('Two teams are required for a challenge.'));
	if (challengerId === challengeeId) return next(new Error('Teams cannot challenge themselves.'));
	
	// Not allowed to issue challenges on weekends
	var todayDay = new Date().getDay();
	var CHALLENGE_ANYTIME = process.env.CHALLENGE_ANYTIME || false;
	if ((todayDay === 0 || todayDay === 6) && !CHALLENGE_ANYTIME) return next(new Error('You can only issue challenges on business days.'));

	// Grabs team info on both challenge participants
	var challengerPromise = Team.findById(challengerId).exec();
	var challengeePromise =	Team.findById(challengeeId).exec();

	Promise.all([challengerPromise, challengeePromise])
		.then(TeamChallengeService.verifyAllowedToChallenge)
		.then(TeamChallenge.createByTeams)
		.then(function(challenge) {
            MailerService.newTeamChallenge(challenge._id);
            req.app.io.sockets.emit('challenge:team:issued');
            res.json({message: 'Challenge issued!'});
		})
		.catch(next);
});


/**
 * Get all challenges involving a team.
 * @param: teamId
 * @return: message.resolved
 * @return: message.outgoing
 * @return: message.incoming
 */
router.get('/:teamId', function(req, res, next) {
	var teamId = req.params.teamId;

	if (!teamId) return next(new Error('This is not a valid team.'));

	var populateTeamMembers = {
        path: 'challenger challengee',
        populate: {path: 'leader partner'}
    };

	var resolvedChallenges = TeamChallenge.getResolved(teamId)
		.then(function(challenges) {
			return TeamChallenge.populate(challenges, 'challenger challengee');
		});

	var outgoingChallenges = TeamChallenge.getOutgoing(teamId)
		.then(function(challenges) {
			return TeamChallenge.populate(challenges, populateTeamMembers);
		});

	var incomingChallenges = TeamChallenge.getIncoming(teamId)
		.then(function(challenges) {
            return TeamChallenge.populate(challenges, populateTeamMembers);
        });

	Promise.all([resolvedChallenges, outgoingChallenges, incomingChallenges])
		.then(function(challenges) {
            res.json({message: {resolved: challenges[0], outgoing: challenges[1], incoming: challenges[2]}});
		})
		.catch(next);

});


/**
 * Revoke wrongly issued challenge.
 * @param: challengerId
 * @param: challengeeId
 */
router.delete('/revoke', function(req, res, next) {
	var challengerId = req.body.challengerId;
	var challengeeId = req.body.challengeeId;
	
	if (!challengerId || !challengeeId) return next(new Error('Both teams must be provided to revoke a challenge.'));

	TeamChallenge.findOne({challenger: challengerId, challengee: challengeeId, winner: null}).exec()
		.then(function(challenge) {
            if (!challenge) return next(new Error('Could not find the challenge.'));
            return ChallengeService.verifyForfeit(challenge);
        })
		.then(function() {
            MailerService.revokedTeamChallenge(challengerId, challengeeId);
            TeamChallenge.remove({challenger: challengerId, challengee: challengeeId, winner: null}).exec();
            req.app.io.sockets.emit('challenge:team:revoked');
            res.json({message: 'Successfully revoked challenge.'});
		})
		.catch(next);
});

/**
 * Resolve challenge by adding a score and winner.
 * @param: challengeId
 * @param: challengerScore
 * @param: challengeeScore
 */
router.post('/resolve', function(req, res, next) {
	var challengeId = req.body.challengeId;
	var challengerScore = req.body.challengerScore;
	var challengeeScore = req.body.challengeeScore;
	
	if (!challengeId) return next(new Error('This is not a valid challenge.'));

	TeamChallenge.findById(challengeId).exec()
		.then(ChallengeService.verifyForfeit)
		.then(function(teamChallenge) {
			return ChallengeService.setScore(teamChallenge, challengerScore, challengeeScore);
		})
        .then(TeamChallengeService.updateLastGames)
		.then(function(teamChallenge) {
			if (challengerScore > challengeeScore) return ChallengeService.swapRanks(teamChallenge);
        })
		.then(function() {
            MailerService.resolvedTeamChallenge(challengeId);
			req.app.io.sockets.emit('challenge:team:resolved');
			res.json({message: 'Successfully resolved challenge.'});
		})
		.catch(next);
});

/**
 * Forfeits an expired challenge.
 * @param: challengeId
 */
router.post('/forfeit', function(req, res, next) {
	var challengeId = req.body.challengeId;
	if (!challengeId) return next(new Error('This is not a valid challenge id.'));
    console.log('Forfeiting challenge id [' + challengeId + ']');

	TeamChallenge.findById(challengeId).exec()
		.then(ChallengeService.setForfeit)
		.then(TeamChallengeService.updateLastGames)
		.then(ChallengeService.swapRanks)
		.then(function() {
            MailerService.forfeitedTeamChallenge(challengeId);
			req.app.io.sockets.emit('challenge:team:forfeited');
			res.json({message: 'Challenge successfully forfeited.'});
		})
		.catch(next);
});



module.exports = router;
